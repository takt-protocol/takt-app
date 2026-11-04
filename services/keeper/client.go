package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type RPCClient struct {
	httpClient *http.Client
	rpcURL     string
}

func NewRPCClient(rpcURL string) *RPCClient {
	return &RPCClient{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		rpcURL:     rpcURL,
	}
}

type JSONRPCRequest struct {
	Jsonrpc string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params"`
	ID      int         `json:"id"`
}

type JSONRPCResponse struct {
	Jsonrpc string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result"`
	Error   *RPCError       `json:"error,omitempty"`
	ID      int             `json:"id"`
}

type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// RestorePreamble represents required footprint restoration before transaction execution.
type RestorePreamble struct {
	MinResourceFee  string `json:"minResourceFee"`
	TransactionData string `json:"transactionData"`
}

// SimulateTransactionResult models the response returned by Soroban JSON-RPC simulateTransaction.
type SimulateTransactionResult struct {
	Error           string                       `json:"error,omitempty"`
	TransactionData string                       `json:"transactionData,omitempty"`
	MinResourceFee  string                       `json:"minResourceFee,omitempty"`
	Results         []SimulationInvocationResult `json:"results,omitempty"`
	RestorePreamble *RestorePreamble             `json:"restorePreamble,omitempty"`
	Events          []string                     `json:"events,omitempty"`
	LatestLedger    uint32                       `json:"latestLedger,omitempty"`
}

// SimulationInvocationResult models individual contract invocation outcomes within a simulation.
type SimulationInvocationResult struct {
	Auth []string `json:"auth,omitempty"`
	Xdr  string   `json:"xdr,omitempty"`
}

// IsSuccessful checks whether the simulation executed cleanly without contract panics or HostErrors.
// Fails closed on nil, null, or structurally incomplete responses.
func (r *SimulateTransactionResult) IsSuccessful() (bool, string) {
	if r == nil {
		return false, "nil simulation result"
	}
	if r.Error != "" {
		return false, fmt.Sprintf("simulation host error: %s", r.Error)
	}
	if r.RestorePreamble != nil {
		return false, "simulation requires state restoration prior to invocation"
	}
	if len(r.Results) != 1 || r.Results[0].Xdr == "" {
		return false, "malformed or incomplete simulation result: expected exactly one invocation return xdr"
	}
	// Verify base64 encoding of return XDR
	if _, err := base64.StdEncoding.DecodeString(r.Results[0].Xdr); err != nil {
		return false, fmt.Sprintf("invalid base64 invocation return xdr: %v", err)
	}
	if r.TransactionData == "" {
		return false, "malformed simulation result: missing transactionData footprint"
	}
	if _, err := base64.StdEncoding.DecodeString(r.TransactionData); err != nil {
		return false, fmt.Sprintf("invalid base64 transactionData footprint: %v", err)
	}
	if r.MinResourceFee == "" {
		return false, "malformed simulation result: missing minResourceFee"
	}
	return true, ""
}

func (c *RPCClient) Call(method string, params interface{}, out interface{}) error {
	reqBody := JSONRPCRequest{
		Jsonrpc: "2.0",
		Method:  method,
		Params:  params,
		ID:      1,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal rpc request: %w", err)
	}

	resp, err := c.httpClient.Post(c.rpcURL, "application/json", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return fmt.Errorf("http post failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected http status code: %d", resp.StatusCode)
	}

	var rpcResp JSONRPCResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return fmt.Errorf("failed to decode rpc response: %w", err)
	}

	if rpcResp.Jsonrpc != "2.0" {
		return fmt.Errorf("invalid json-rpc version: %s", rpcResp.Jsonrpc)
	}

	if rpcResp.ID != 1 {
		return fmt.Errorf("mismatched json-rpc response id: expected 1, got %d", rpcResp.ID)
	}

	if rpcResp.Error != nil {
		return fmt.Errorf("rpc error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	if len(rpcResp.Result) == 0 || string(rpcResp.Result) == "null" {
		return fmt.Errorf("empty or null rpc result")
	}

	if err := json.Unmarshal(rpcResp.Result, out); err != nil {
		return fmt.Errorf("failed to unmarshal rpc result: %w", err)
	}

	return nil
}

// SimulateTransaction submits an envelope XDR to Soroban simulateTransaction for pre-flight validation.
func (c *RPCClient) SimulateTransaction(txXdr string) (*SimulateTransactionResult, error) {
	if txXdr == "" {
		return nil, fmt.Errorf("transaction xdr cannot be empty")
	}

	var result SimulateTransactionResult
	params := map[string]interface{}{
		"transaction": txXdr,
	}
	err := c.Call("simulateTransaction", params, &result)
	if err != nil {
		return nil, err
	}
	return &result, nil
}
