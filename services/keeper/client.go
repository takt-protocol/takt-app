package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"time"
)

type RetryPolicy struct {
	MaxRetries     int
	InitialBackoff time.Duration
	MaxBackoff     time.Duration
	BackoffFactor  float64
}

func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{
		MaxRetries:     3,
		InitialBackoff: 200 * time.Millisecond,
		MaxBackoff:     2 * time.Second,
		BackoffFactor:  2.0,
	}
}

type RPCClient struct {
	httpClient *http.Client
	rpcURL     string
	retry      RetryPolicy
}

func NewRPCClient(rpcURL string) *RPCClient {
	return &RPCClient{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		rpcURL:     rpcURL,
		retry:      DefaultRetryPolicy(),
	}
}

func (c *RPCClient) SetRetryPolicy(policy RetryPolicy) {
	c.retry = policy
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

func isRetryableStatus(code int) bool {
	return code == http.StatusTooManyRequests || // 429
		code == http.StatusBadGateway || // 502
		code == http.StatusServiceUnavailable || // 503
		code == http.StatusGatewayTimeout // 504
}

func (c *RPCClient) calculateBackoff(attempt int) time.Duration {
	backoff := float64(c.retry.InitialBackoff) * math.Pow(c.retry.BackoffFactor, float64(attempt))
	if backoff > float64(c.retry.MaxBackoff) {
		backoff = float64(c.retry.MaxBackoff)
	}
	jitter := float64(rand.Int63n(int64(backoff)/4 + 1))
	return time.Duration(backoff + jitter)
}

func (c *RPCClient) Call(method string, params interface{}, out interface{}) error {
	return c.CallWithContext(context.Background(), method, params, out)
}

func (c *RPCClient) CallWithContext(ctx context.Context, method string, params interface{}, out interface{}) error {
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

	maxAttempts := c.retry.MaxRetries + 1
	var lastErr error

	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			sleepDur := c.calculateBackoff(attempt - 1)
			select {
			case <-ctx.Done():
				return fmt.Errorf("context cancelled during retry backoff: %w", ctx.Err())
			case <-time.After(sleepDur):
			}
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.rpcURL, bytes.NewReader(bodyBytes))
		if err != nil {
			return fmt.Errorf("failed to create http request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(httpReq)
		if err != nil {
			lastErr = fmt.Errorf("http post failed: %w", err)
			continue
		}

		if isRetryableStatus(resp.StatusCode) {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			lastErr = fmt.Errorf("transient http status %d: %s", resp.StatusCode, resp.Status)
			continue
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return fmt.Errorf("unexpected http status %d: %s", resp.StatusCode, string(body))
		}

		var rpcResp JSONRPCResponse
		decodeErr := json.NewDecoder(resp.Body).Decode(&rpcResp)
		resp.Body.Close()

		if decodeErr != nil {
			return fmt.Errorf("failed to decode rpc response: %w", decodeErr)
		}

		if rpcResp.Error != nil {
			return fmt.Errorf("rpc error (code %d): %s", rpcResp.Error.Code, rpcResp.Error.Message)
		}

		if out != nil {
			if err := json.Unmarshal(rpcResp.Result, out); err != nil {
				return fmt.Errorf("failed to unmarshal rpc result into target: %w", err)
			}
		}

		return nil
	}

	return fmt.Errorf("rpc call failed after %d attempts: %w", maxAttempts, lastErr)
}
