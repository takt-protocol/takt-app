package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestRPCClientRetriesOnTransientErrorsAndSucceeds(t *testing.T) {
	var attempts int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&attempts, 1)
		if count == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		if count == 2 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      1,
			"result":  map[string]string{"status": "healthy"},
		})
	}))
	defer srv.Close()

	client := NewRPCClientWithRetry(srv.URL, 3, 5*time.Millisecond)
	var out map[string]string
	if err := client.Call("getHealth", map[string]interface{}{}, &out); err != nil {
		t.Fatalf("expected call to succeed after transient retries, got: %v", err)
	}
	if out["status"] != "healthy" {
		t.Fatalf("expected healthy status, got: %v", out["status"])
	}
	if got := atomic.LoadInt32(&attempts); got != 3 {
		t.Fatalf("expected 3 attempts, got %d", got)
	}
}

func TestRPCClientDoesNotRetryJSONRPCApplicationError(t *testing.T) {
	var attempts int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      1,
			"error": map[string]interface{}{
				"code":    -32600,
				"message": "Invalid Request",
			},
		})
	}))
	defer srv.Close()

	client := NewRPCClientWithRetry(srv.URL, 3, 5*time.Millisecond)
	var out map[string]interface{}
	err := client.Call("getHealth", nil, &out)
	if err == nil || !strings.Contains(err.Error(), "rpc error -32600") {
		t.Fatalf("expected rpc error -32600, got: %v", err)
	}
	if got := atomic.LoadInt32(&attempts); got != 1 {
		t.Fatalf("expected no retries for JSON-RPC error, got %d attempts", got)
	}
}
