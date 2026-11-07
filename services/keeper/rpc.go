package main

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"strconv"
	"strings"
)

// RestorePreamble represents ledger footprint entries that require state restoration prior to execution.
type RestorePreamble struct {
	MinResourceFee  string `json:"minResourceFee"`
	TransactionData string `json:"transactionData"`
}

// SimulationInvocationResult models the outcome of a single host function invocation inside simulateTransaction.
type SimulationInvocationResult struct {
	Auth []string `json:"auth,omitempty"`
	Xdr  string   `json:"xdr,omitempty"`
}

// SimulateTransactionResult models the Soroban JSON-RPC simulateTransaction response payload.
type SimulateTransactionResult struct {
	Error           string                       `json:"error,omitempty"`
	TransactionData string                       `json:"transactionData,omitempty"`
	MinResourceFee  string                       `json:"minResourceFee,omitempty"`
	Results         []SimulationInvocationResult `json:"results,omitempty"`
	RestorePreamble *RestorePreamble             `json:"restorePreamble,omitempty"`
	Events          []string                     `json:"events,omitempty"`
	LatestLedger    uint32                       `json:"latestLedger,omitempty"`
	SimulatedTxXDR  string                       `json:"-"`
}

// SendTransactionResult models the Soroban JSON-RPC sendTransaction response payload.
type SendTransactionResult struct {
	Hash            string `json:"hash"`
	Status          string `json:"status"`
	LatestLedger    uint32 `json:"latestLedger,omitempty"`
	ErrorResultXdr  string `json:"errorResultXdr,omitempty"`
	DiagnosticError string `json:"diagnosticEventsXdr,omitempty"`
}

// Validate checks whether the Soroban simulateTransaction response succeeded without HostError,
// contract revert, state restoration requirements, or malformed XDR footprints.
// Returns (true, "") when safe to submit on-chain, or (false, diagnosticReason) when execution must be skipped.
func (r *SimulateTransactionResult) Validate() (bool, string) {
	if r == nil {
		return false, "nil simulation result"
	}

	if errText := strings.TrimSpace(r.Error); errText != "" {
		return false, fmt.Sprintf("simulation reverted: %s", errText)
	}

	if r.RestorePreamble != nil {
		return false, "simulation requires ledger state restoration (restorePreamble present)"
	}

	if len(r.Results) != 1 {
		return false, fmt.Sprintf("invalid simulation results count: expected 1 invocation result, got %d", len(r.Results))
	}

	returnXdr := strings.TrimSpace(r.Results[0].Xdr)
	if returnXdr == "" {
		return false, "missing invocation return XDR in simulation results[0]"
	}
	decodedReturn, err := base64.StdEncoding.DecodeString(returnXdr)
	if err != nil || len(decodedReturn) == 0 || len(decodedReturn)%4 != 0 {
		return false, "malformed base64 XDR in simulation results[0]"
	}

	txData := strings.TrimSpace(r.TransactionData)
	if txData == "" {
		return false, "missing transactionData footprint in simulation result"
	}
	decodedTxData, err := base64.StdEncoding.DecodeString(txData)
	if err != nil || len(decodedTxData) == 0 || len(decodedTxData)%4 != 0 {
		return false, "malformed base64 transactionData footprint in simulation result"
	}

	feeStr := strings.TrimSpace(r.MinResourceFee)
	if feeStr == "" {
		return false, "missing minResourceFee in simulation result"
	}
	if _, err := strconv.ParseUint(feeStr, 10, 64); err != nil {
		return false, fmt.Sprintf("invalid minResourceFee %q: must be non-negative integer", feeStr)
	}

	return true, ""
}

// IsSuccessful is an alias for Validate for caller convenience.
func (r *SimulateTransactionResult) IsSuccessful() (bool, string) {
	return r.Validate()
}

// SimulateTransaction invokes the Soroban RPC simulateTransaction method with a base64-encoded transaction envelope.
func (c *RPCClient) SimulateTransaction(txXdr string) (*SimulateTransactionResult, error) {
	trimmed := strings.TrimSpace(txXdr)
	if trimmed == "" {
		return nil, fmt.Errorf("transaction XDR cannot be empty")
	}

	var result SimulateTransactionResult
	params := map[string]interface{}{
		"transaction": trimmed,
	}
	if err := c.Call("simulateTransaction", params, &result); err != nil {
		return nil, err
	}
	result.SimulatedTxXDR = trimmed
	return &result, nil
}

// SendTransaction submits a signed Soroban transaction envelope via sendTransaction.
func (c *RPCClient) SendTransaction(txXdr string) (*SendTransactionResult, error) {
	trimmed := strings.TrimSpace(txXdr)
	if trimmed == "" {
		return nil, fmt.Errorf("transaction XDR cannot be empty")
	}

	var result SendTransactionResult
	params := map[string]interface{}{
		"transaction": trimmed,
	}
	if err := c.Call("sendTransaction", params, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// BuildExecuteJobEnvelopeXDR constructs a deterministic, 4-byte-aligned XDR envelope payload
// encoding the target JobEngine contract ID and job_id for execute_job simulation.
func BuildExecuteJobEnvelopeXDR(jobEngineID string, jobID uint64) (string, error) {
	if jobID == 0 {
		return "", fmt.Errorf("job ID must be greater than zero")
	}
	engine := strings.TrimSpace(jobEngineID)
	if engine == "" {
		return "", fmt.Errorf("jobEngineID cannot be empty")
	}

	// XDR string padding to 4-byte boundary for contract identifier + function + jobID
	engineBytes := []byte(engine)
	paddedLen := (len(engineBytes) + 3) & ^3
	buf := make([]byte, 16+paddedLen)
	binary.BigEndian.PutUint32(buf[0:4], 24) // ENVELOPE_TYPE_TX / invokeHostFunction marker
	binary.BigEndian.PutUint32(buf[4:8], uint32(len(engineBytes)))
	copy(buf[8:8+len(engineBytes)], engineBytes)
	offset := 8 + paddedLen
	binary.BigEndian.PutUint64(buf[offset:offset+8], jobID)
	return base64.StdEncoding.EncodeToString(buf), nil
}
