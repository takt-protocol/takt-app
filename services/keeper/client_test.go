package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestRPCClient_SuccessWithoutRetry(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		resp := JSONRPCResponse{
			Jsonrpc: "2.0",
			Result:  json.RawMessage(`{"status":"ok"}`),
			ID:      1,
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewRPCClient(server.URL)
	var out map[string]string
	err := client.Call("testMethod", nil, &out)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if out["status"] != "ok" {
		t.Fatalf("expected status 'ok', got %v", out["status"])
	}
	if atomic.LoadInt32(&calls) != 1 {
		t.Fatalf("expected exactly 1 call, got %d", calls)
	}
}

func TestRPCClient_RetrySuccessOn503(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := atomic.AddInt32(&calls, 1)
		if current < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte("Service Unavailable"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		resp := JSONRPCResponse{
			Jsonrpc: "2.0",
			Result:  json.RawMessage(`{"recovered":true}`),
			ID:      1,
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewRPCClient(server.URL)
	client.SetRetryPolicy(RetryPolicy{
		MaxRetries:     3,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     50 * time.Millisecond,
		BackoffFactor:  1.5,
	})

	var out map[string]bool
	err := client.Call("testMethod", nil, &out)
	if err != nil {
		t.Fatalf("expected retry to succeed on attempt 3, got: %v", err)
	}
	if !out["recovered"] {
		t.Fatalf("expected recovered true")
	}
	if atomic.LoadInt32(&calls) != 3 {
		t.Fatalf("expected 3 calls, got %d", calls)
	}
}

func TestRPCClient_ExhaustedRetries(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte("Rate Limited"))
	}))
	defer server.Close()

	client := NewRPCClient(server.URL)
	client.SetRetryPolicy(RetryPolicy{
		MaxRetries:     2,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     20 * time.Millisecond,
		BackoffFactor:  1.5,
	})

	err := client.Call("testMethod", nil, nil)
	if err == nil {
		t.Fatalf("expected error after exhausted retries, got nil")
	}
	if atomic.LoadInt32(&calls) != 3 {
		t.Fatalf("expected 3 attempts, got %d", calls)
	}
}

func TestRPCClient_ContextCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer server.Close()

	client := NewRPCClient(server.URL)
	client.SetRetryPolicy(RetryPolicy{
		MaxRetries:     5,
		InitialBackoff: 500 * time.Millisecond,
		MaxBackoff:     2 * time.Second,
		BackoffFactor:  2.0,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	start := time.Now()
	err := client.CallWithContext(ctx, "testMethod", nil, nil)
	elapsed := time.Since(start)

	if err == nil {
		t.Fatalf("expected context cancellation error, got nil")
	}
	if elapsed > 400*time.Millisecond {
		t.Fatalf("expected immediate cancellation, took %v", elapsed)
	}
}

func TestRPCClient_NonRetryableStatus(t *testing.T) {
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("Bad Request"))
	}))
	defer server.Close()

	client := NewRPCClient(server.URL)
	client.SetRetryPolicy(RetryPolicy{
		MaxRetries:     3,
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     50 * time.Millisecond,
		BackoffFactor:  2.0,
	})

	err := client.Call("testMethod", nil, nil)
	if err == nil {
		t.Fatalf("expected error on 400, got nil")
	}
	if atomic.LoadInt32(&calls) != 1 {
		t.Fatalf("expected 1 call (no retry on 400), got %d", calls)
	}
}
