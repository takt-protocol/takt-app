package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestHealthEndpoint(t *testing.T) {
	daemon := NewKeeperDaemon(&Config{})
	mux := daemon.SetupHTTPServer()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got: %d", w.Code)
	}

	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got: %s", ct)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}

	if resp["status"] != "healthy" {
		t.Errorf("expected status 'healthy', got: %s", resp["status"])
	}
	if resp["service"] != "takt-keeper" {
		t.Errorf("expected service 'takt-keeper', got: %s", resp["service"])
	}

	// Test non-GET method validation
	reqPost := httptest.NewRequest(http.MethodPost, "/health", nil)
	wPost := httptest.NewRecorder()
	mux.ServeHTTP(wPost, reqPost)

	if wPost.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405 on POST /health, got: %d", wPost.Code)
	}
	if allow := wPost.Header().Get("Allow"); allow != "GET" {
		t.Errorf("expected Allow: GET header, got: %s", allow)
	}
}

func TestMetricsEndpoint_InitialState(t *testing.T) {
	daemon := NewKeeperDaemon(&Config{})
	mux := daemon.SetupHTTPServer()

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got: %d", w.Code)
	}

	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got: %s", ct)
	}

	// Verify all 5 JSON keys explicitly
	var rawMap map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&rawMap); err != nil {
		t.Fatalf("failed to decode metrics map: %v", err)
	}

	expectedKeys := []string{"polls_total", "executions_attempted", "executions_succeeded", "last_poll_timestamp", "uptime_seconds"}
	for _, key := range expectedKeys {
		if _, exists := rawMap[key]; !exists {
			t.Errorf("missing expected key in metrics payload: %s", key)
		}
	}

	if rawMap["polls_total"].(float64) != 0 {
		t.Errorf("expected initial polls_total 0, got: %v", rawMap["polls_total"])
	}
	if rawMap["executions_attempted"].(float64) != 0 {
		t.Errorf("expected initial executions_attempted 0, got: %v", rawMap["executions_attempted"])
	}
	if rawMap["executions_succeeded"].(float64) != 0 {
		t.Errorf("expected initial executions_succeeded 0, got: %v", rawMap["executions_succeeded"])
	}
	if rawMap["last_poll_timestamp"].(float64) != 0 {
		t.Errorf("expected initial last_poll_timestamp 0, got: %v", rawMap["last_poll_timestamp"])
	}
	if rawMap["uptime_seconds"].(float64) < 0 {
		t.Errorf("expected non-negative uptime, got: %v", rawMap["uptime_seconds"])
	}
}

func TestMetrics_MethodNotAllowed(t *testing.T) {
	daemon := NewKeeperDaemon(&Config{})
	mux := daemon.SetupHTTPServer()

	req := httptest.NewRequest(http.MethodPost, "/metrics", nil)
	w := httptest.NewRecorder()

	mux.ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 Method Not Allowed on POST, got: %d", w.Code)
	}
	if allow := w.Header().Get("Allow"); allow != "GET" {
		t.Errorf("expected Allow: GET header, got: %s", allow)
	}
}

func TestMetrics_CountersIncrement(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(JSONRPCResponse{
			Jsonrpc: "2.0",
			ID:      1,
			Result: json.RawMessage(`{
				"transactionData": "AAAAAgAAAAE=",
				"minResourceFee": "15000",
				"results": [{"xdr": "AAAAAQ=="}]
			}`),
		})
	}))
	defer server.Close()

	daemon := NewKeeperDaemon(&Config{})
	daemon.client = NewRPCClient(server.URL)

	daemon.SetExecutor(func(job *Job, preparedTx string) error {
		return nil
	})

	jobs := []*Job{
		{ID: 1, TargetContract: "ContractA", TargetFn: "fnA"},
		{ID: 2, TargetContract: "ContractB", TargetFn: "fnB"},
	}
	daemon.SetCandidateJobs(jobs)
	daemon.SetTxBuilder(func(job *Job) string {
		return "valid_tx_xdr"
	})

	// Run 2 poll cycles
	daemon.pollAndExecuteJobs()
	time.Sleep(10 * time.Millisecond)
	daemon.pollAndExecuteJobs()

	metrics := daemon.GetMetrics()

	if metrics.PollsTotal != 2 {
		t.Errorf("expected polls_total 2, got: %d", metrics.PollsTotal)
	}
	if metrics.ExecutionsAttempted != 4 {
		t.Errorf("expected executions_attempted 4, got: %d", metrics.ExecutionsAttempted)
	}
	if metrics.ExecutionsSucceeded != 4 {
		t.Errorf("expected executions_succeeded 4, got: %d", metrics.ExecutionsSucceeded)
	}
	if metrics.LastPollTimestamp == 0 {
		t.Errorf("expected non-zero last_poll_timestamp")
	}

	// Verify metrics endpoint serves updated values
	mux := daemon.SetupHTTPServer()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	var servedMetrics KeeperMetrics
	if err := json.NewDecoder(w.Body).Decode(&servedMetrics); err != nil {
		t.Fatalf("failed to decode served metrics: %v", err)
	}

	if servedMetrics.PollsTotal != 2 {
		t.Errorf("expected served polls_total 2, got: %d", servedMetrics.PollsTotal)
	}
	if servedMetrics.ExecutionsSucceeded != 4 {
		t.Errorf("expected served executions_succeeded 4, got: %d", servedMetrics.ExecutionsSucceeded)
	}
}

func TestMetrics_ConcurrentAccess(t *testing.T) {
	daemon := NewKeeperDaemon(&Config{})

	var wg sync.WaitGroup
	workers := 20
	iterations := 100
	expected := uint64(workers * iterations)

	// Concurrent incrementers simulating atomic worker updates
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				atomic.AddUint64(&daemon.pollsTotal, 1)
				atomic.AddUint64(&daemon.executionsAttempted, 1)
				atomic.AddUint64(&daemon.executionsSucceeded, 1)
				atomic.StoreInt64(&daemon.lastPollTimestamp, time.Now().Unix())
			}
		}()
	}

	// Concurrent readers asserting monotonic range bounds
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				m := daemon.GetMetrics()
				if m.PollsTotal > expected {
					t.Errorf("counter exceeded upper bound")
				}
			}
		}()
	}

	wg.Wait()

	finalMetrics := daemon.GetMetrics()
	if finalMetrics.PollsTotal != expected {
		t.Errorf("expected final polls_total %d, got: %d", expected, finalMetrics.PollsTotal)
	}
	if finalMetrics.ExecutionsAttempted != expected {
		t.Errorf("expected final executions_attempted %d, got: %d", expected, finalMetrics.ExecutionsAttempted)
	}
	if finalMetrics.ExecutionsSucceeded != expected {
		t.Errorf("expected final executions_succeeded %d, got: %d", expected, finalMetrics.ExecutionsSucceeded)
	}
}
