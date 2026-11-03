package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealthEndpoint(t *testing.T) {
	cfg := &Config{
		RPCURL:              "https://soroban-testnet.stellar.org",
		KeeperSecret:        "test-secret",
		PollIntervalSeconds: 10,
		APIPort:             8080,
	}
	daemon := NewKeeperDaemon(cfg)
	handler := daemon.SetupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Fatalf("expected Content-Type application/json, got %s", contentType)
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}

	if resp["status"] != "healthy" || resp["service"] != "takt-keeper" {
		t.Fatalf("unexpected health payload: %v", resp)
	}
}

func TestMetricsEndpoint(t *testing.T) {
	cfg := &Config{
		RPCURL:              "https://soroban-testnet.stellar.org",
		KeeperSecret:        "test-secret",
		PollIntervalSeconds: 10,
		APIPort:             8080,
	}
	daemon := NewKeeperDaemon(cfg)
	handler := daemon.SetupRoutes()

	// Initial metrics check: all zeros
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}

	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Fatalf("expected Content-Type application/json, got %s", contentType)
	}

	var metrics MetricsResponse
	if err := json.NewDecoder(rr.Body).Decode(&metrics); err != nil {
		t.Fatalf("failed to decode metrics response: %v", err)
	}

	if metrics.PollsTotal != 0 || metrics.ExecutionsAttempted != 0 || metrics.ExecutionsSucceeded != 0 || metrics.LastPollTimestamp != 0 {
		t.Fatalf("expected zero metrics initially, got: %+v", metrics)
	}

	// Trigger a poll cycle
	startTime := time.Now().Unix()
	daemon.pollAndExecuteJobs()

	// Check metrics after poll
	req = httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rr.Code)
	}

	if err := json.NewDecoder(rr.Body).Decode(&metrics); err != nil {
		t.Fatalf("failed to decode metrics response: %v", err)
	}

	if metrics.PollsTotal != 1 {
		t.Fatalf("expected PollsTotal == 1, got %d", metrics.PollsTotal)
	}

	if metrics.LastPollTimestamp < startTime {
		t.Fatalf("expected LastPollTimestamp >= %d, got %d", startTime, metrics.LastPollTimestamp)
	}

	// Simulate execution counter increments
	daemon.executionsAttempted.Add(5)
	daemon.executionsSucceeded.Add(4)

	req = httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if err := json.NewDecoder(rr.Body).Decode(&metrics); err != nil {
		t.Fatalf("failed to decode metrics response: %v", err)
	}

	if metrics.ExecutionsAttempted != 5 {
		t.Fatalf("expected ExecutionsAttempted == 5, got %d", metrics.ExecutionsAttempted)
	}
	if metrics.ExecutionsSucceeded != 4 {
		t.Fatalf("expected ExecutionsSucceeded == 4, got %d", metrics.ExecutionsSucceeded)
	}
}
