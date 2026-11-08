package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCanSubmitJobExecutionSkipsRevertedSimulation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      1,
			"result": map[string]interface{}{
				"error":        "HostError: Error(Contract, #10)",
				"latestLedger": 12345,
			},
		})
	}))
	defer srv.Close()

	daemon := NewKeeperDaemon(&Config{RPCURL: srv.URL})
	ok, simRes, err := daemon.CanSubmitJobExecution(7, "AAAA...XDR")
	if err != nil {
		t.Fatalf("unexpected rpc error: %v", err)
	}
	if ok {
		t.Fatalf("expected CanSubmitJobExecution to return false when simulation reverts")
	}
	if simRes == nil || simRes.Error == "" {
		t.Fatalf("expected non-empty simulation error")
	}
	code, name, parsed := ParseJobEngineContractError(simRes.Error)
	if !parsed || code != 10 || name != "IntervalNotElapsed" {
		t.Fatalf("expected EngineError #10 IntervalNotElapsed, got parsed=%v code=%d name=%s", parsed, code, name)
	}
}

func TestCanSubmitJobExecutionAllowsSuccessfulSimulation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      1,
			"result": map[string]interface{}{
				"transactionData": "AAAA",
				"minResourceFee":  "10000",
				"latestLedger":    12346,
			},
		})
	}))
	defer srv.Close()

	daemon := NewKeeperDaemon(&Config{RPCURL: srv.URL})
	ok, simRes, err := daemon.CanSubmitJobExecution(7, "AAAA...XDR")
	if err != nil {
		t.Fatalf("unexpected rpc error: %v", err)
	}
	if !ok {
		t.Fatalf("expected CanSubmitJobExecution to allow submission on clean simulation")
	}
	if simRes.MinResourceFee != "10000" {
		t.Fatalf("expected minResourceFee 10000, got %s", simRes.MinResourceFee)
	}
}
