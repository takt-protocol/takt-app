package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestDaemon() *KeeperDaemon {
	return NewKeeperDaemon(&Config{
		RPCURL:              "https://soroban-testnet.stellar.org",
		KeeperSecret:        "SDUMMYSECRETKEYFORTESTING",
		PollIntervalSeconds: 10,
		APIPort:             8080,
		KeeperRegistryId:    "CDSBDXYELFFHM7XMG4D4BXEVETOHQDWPQOTQLPRHGTTVW7DTNODHIIZN",
		BountyVaultId:       "CDDIJAZCXR7TWSTI4B2FSE7MCXFKH2JVOBT4WELSSJLZHV5XQ4PKHEGO",
		JobEngineId:         "CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT",
	})
}

func TestHealthEndpoint(t *testing.T) {
	daemon := newTestDaemon()
	mux := daemon.NewServeMux()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d", rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if !strings.HasPrefix(contentType, "application/json") {
		t.Fatalf("expected Content-Type application/json, got %q", contentType)
	}

	var payload map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode /health response: %v", err)
	}

	if payload["status"] != "healthy" {
		t.Errorf("expected status='healthy', got %q", payload["status"])
	}
	if payload["service"] != "takt-keeper" {
		t.Errorf("expected service='takt-keeper', got %q", payload["service"])
	}
}

func TestMetricsEndpointInitialAndAfterPolling(t *testing.T) {
	daemon := newTestDaemon()
	mux := daemon.NewServeMux()

	// 1. Verify initial metrics state
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d", rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if !strings.HasPrefix(contentType, "application/json") {
		t.Fatalf("expected Content-Type application/json, got %q", contentType)
	}

	var initial KeeperMetrics
	if err := json.NewDecoder(rec.Body).Decode(&initial); err != nil {
		t.Fatalf("failed to decode initial /metrics response: %v", err)
	}

	if initial.PollsTotal != 0 || initial.ExecutionsAttempted != 0 || initial.ExecutionsSucceeded != 0 || initial.LastPollTimestamp != 0 {
		t.Fatalf("expected zeroed initial metrics, got %+v", initial)
	}

	// 2. Run poll cycles and record executions
	daemon.pollAndExecuteJobs()
	daemon.pollAndExecuteJobs()
	daemon.RecordExecution(true)
	daemon.RecordExecution(false)
	daemon.RecordExecution(true)

	// 3. Query /metrics again
	req2 := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec2 := httptest.NewRecorder()
	mux.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d", rec2.Code)
	}

	var updated KeeperMetrics
	if err := json.NewDecoder(rec2.Body).Decode(&updated); err != nil {
		t.Fatalf("failed to decode updated /metrics response: %v", err)
	}

	if updated.PollsTotal != 2 {
		t.Errorf("expected polls_total=2, got %d", updated.PollsTotal)
	}
	if updated.ExecutionsAttempted != 3 {
		t.Errorf("expected executions_attempted=3, got %d", updated.ExecutionsAttempted)
	}
	if updated.ExecutionsSucceeded != 2 {
		t.Errorf("expected executions_succeeded=2, got %d", updated.ExecutionsSucceeded)
	}
	if updated.LastPollTimestamp <= 0 {
		t.Errorf("expected positive last_poll_timestamp, got %d", updated.LastPollTimestamp)
	}
}
