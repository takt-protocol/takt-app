package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
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

type SimulateTransactionParams struct {
	Transaction string `json:"transaction"`
}

type SimulateTransactionResult struct {
	Error           string `json:"error,omitempty"`
	TransactionData string `json:"transactionData,omitempty"`
	MinResourceFee  string `json:"minResourceFee,omitempty"`
	LatestLedger    uint64 `json:"latestLedger,omitempty"`
}

var contractErrRegex = regexp.MustCompile(`(?i)Error\(Contract,\s*#(\d+)\)`)

var jobEngineErrorNames = map[int]string{
	1:  "AlreadyInitialized",
	2:  "NotInitialized",
	3:  "InvalidInterval",
	4:  "InvalidBounty",
	5:  "InsufficientInitialFunding",
	6:  "JobNotFound",
	7:  "JobNotActive",
	8:  "JobNotPaused",
	9:  "UnauthorizedOwner",
	10: "IntervalNotElapsed",
	11: "MaxRunsReached",
	12: "Overflow",
}

func ParseJobEngineContractError(raw string) (int, string, bool) {
	matches := contractErrRegex.FindStringSubmatch(raw)
	if len(matches) < 2 {
		return 0, "", false
	}
	code, err := strconv.Atoi(matches[1])
	if err != nil {
		return 0, "", false
	}
	name, ok := jobEngineErrorNames[code]
	if !ok {
		name = "UnknownContractError"
	}
	return code, name, true
}

func (c *RPCClient) SimulateTransaction(txXdr string) (*SimulateTransactionResult, error) {
	var result SimulateTransactionResult
	err := c.Call("simulateTransaction", SimulateTransactionParams{Transaction: txXdr}, &result)
	if err != nil {
		return nil, err
	}
	return &result, nil
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

	var rpcResp JSONRPCResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return fmt.Errorf("failed to decode rpc response: %w", err)
	}

	if rpcResp.Error != nil {
		return fmt.Errorf("rpc error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	if err := json.Unmarshal(rpcResp.Result, out); err != nil {
		return fmt.Errorf("failed to unmarshal rpc result: %w", err)
	}

	return nil
}
