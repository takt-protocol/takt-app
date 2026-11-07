package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"
)

type RPCClient struct {
	httpClient *http.Client
	rpcURL     string
	nextID     uint64
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

func (c *RPCClient) Call(method string, params interface{}, out interface{}) error {
	if c == nil || c.httpClient == nil {
		return fmt.Errorf("rpc client is not initialized")
	}
	if c.rpcURL == "" {
		return fmt.Errorf("rpc url cannot be empty")
	}

	reqID := int(atomic.AddUint64(&c.nextID, 1))
	if reqID <= 0 {
		reqID = 1
	}

	reqBody := JSONRPCRequest{
		Jsonrpc: "2.0",
		Method:  method,
		Params:  params,
		ID:      reqID,
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

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("unexpected http status code: %d", resp.StatusCode)
	}

	var rpcResp JSONRPCResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return fmt.Errorf("failed to decode rpc response: %w", err)
	}

	if rpcResp.Jsonrpc != "2.0" {
		return fmt.Errorf("invalid json-rpc version: %q", rpcResp.Jsonrpc)
	}

	if rpcResp.ID != reqID {
		return fmt.Errorf("mismatched json-rpc response id: expected %d, got %d", reqID, rpcResp.ID)
	}

	if rpcResp.Error != nil {
		return fmt.Errorf("rpc error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	trimmedResult := bytes.TrimSpace(rpcResp.Result)
	if len(trimmedResult) == 0 || bytes.Equal(trimmedResult, []byte("null")) {
		return fmt.Errorf("empty or null rpc result")
	}

	if out != nil {
		if err := json.Unmarshal(trimmedResult, out); err != nil {
			return fmt.Errorf("failed to unmarshal rpc result: %w", err)
		}
	}

	return nil
}
