package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"time"
)

type RPCClient struct {
	httpClient *http.Client
	rpcURL     string
	maxRetries int
	baseDelay  time.Duration
}

func NewRPCClient(rpcURL string) *RPCClient {
	return NewRPCClientWithRetry(rpcURL, 3, 500*time.Millisecond)
}

func NewRPCClientWithRetry(rpcURL string, maxRetries int, baseDelay time.Duration) *RPCClient {
	if maxRetries < 0 {
		maxRetries = 0
	}
	if baseDelay <= 0 {
		baseDelay = 500 * time.Millisecond
	}
	return &RPCClient{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		rpcURL:     rpcURL,
		maxRetries: maxRetries,
		baseDelay:  baseDelay,
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

func isRetryableStatus(statusCode int) bool {
	return statusCode == http.StatusTooManyRequests ||
		statusCode == http.StatusInternalServerError ||
		statusCode == http.StatusBadGateway ||
		statusCode == http.StatusServiceUnavailable ||
		statusCode == http.StatusGatewayTimeout
}

func (c *RPCClient) computeBackoff(attempt int) time.Duration {
	delay := c.baseDelay * (1 << attempt)
	jitterMax := int64(delay / 4)
	if jitterMax > 0 {
		delay += time.Duration(rand.Int63n(jitterMax))
	}
	return delay
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

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(c.computeBackoff(attempt - 1))
		}

		resp, err := c.httpClient.Post(c.rpcURL, "application/json", bytes.NewBuffer(bodyBytes))
		if err != nil {
			lastErr = fmt.Errorf("http post failed: %w", err)
			continue
		}

		if isRetryableStatus(resp.StatusCode) {
			resp.Body.Close()
			lastErr = fmt.Errorf("transient rpc http status %d", resp.StatusCode)
			continue
		}

		if resp.StatusCode >= 400 {
			resp.Body.Close()
			return fmt.Errorf("non-retryable rpc http status %d", resp.StatusCode)
		}

		var rpcResp JSONRPCResponse
		decodeErr := json.NewDecoder(resp.Body).Decode(&rpcResp)
		resp.Body.Close()
		if decodeErr != nil {
			return fmt.Errorf("failed to decode rpc response: %w", decodeErr)
		}

		// Do not retry application-level JSON-RPC errors (e.g. -32600 Invalid Request)
		if rpcResp.Error != nil {
			return fmt.Errorf("rpc error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
		}

		if out != nil && len(rpcResp.Result) > 0 {
			if err := json.Unmarshal(rpcResp.Result, out); err != nil {
				return fmt.Errorf("failed to unmarshal rpc result: %w", err)
			}
		}

		return nil
	}

	return fmt.Errorf("rpc call %s failed after %d retries: %w", method, c.maxRetries, lastErr)
}
