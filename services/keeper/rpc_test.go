package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestSimulateAndExecuteCandidateJobs(t *testing.T) {
	var simulateCalls int32
	var executeCalls int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req JSONRPCRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("failed to decode request: %v", err)
		}

		paramsMap, _ := req.Params.(map[string]interface{})
		txXDR, _ := paramsMap["transaction"].(string)

		w.Header().Set("Content-Type", "application/json")

		switch req.Method {
		case "simulateTransaction":
			atomic.AddInt32(&simulateCalls, 1)
			if strings.Contains(txXDR, "job:1:") {
				// Simulate HostError / Contract error on Job #1
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"jsonrpc": "2.0",
					"id":      req.ID,
					"result": map[string]interface{}{
						"error":        "HostError: Error(Contract, #12)",
						"latestLedger": 543210,
					},
				})
				return
			}
			if strings.Contains(txXDR, "job:2:") {
				// Simulate empty results without error string on Job #2
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"jsonrpc": "2.0",
					"id":      req.ID,
					"result": map[string]interface{}{
						"results":      []interface{}{},
						"latestLedger": 543210,
					},
				})
				return
			}
			// Healthy simulation for Job #3
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      req.ID,
				"result": map[string]interface{}{
					"results": []map[string]interface{}{
						{"xdr": "AAAAAw=="},
					},
					"latestLedger": 543210,
				},
			})
		case "sendTransaction":
			atomic.AddInt32(&executeCalls, 1)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"jsonrpc": "2.0",
				"id":      req.ID,
				"result": map[string]interface{}{
					"hash":   "tx_hash_job_3",
					"status": "PENDING",
				},
			})
		default:
			t.Fatalf("unexpected RPC method: %s", req.Method)
		}
	}))
	defer server.Close()

	daemon := NewKeeperDaemon(&Config{
		RPCURL:              server.URL,
		KeeperSecret:        "SBKGRYZZEELD6POCG5E3MNMA3CT7OKF45CUX3FUDSJH6NJXAMTPXIYRS",
		PollIntervalSeconds: 10,
		APIPort:             8080,
		JobEngineId:         "CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT",
	})

	candidates := []Job{
		{
			ID:             1,
			TargetContract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
			TargetFn:       "reverting_target",
			Status:         StatusActive,
		},
		{
			ID:             2,
			TargetContract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
			TargetFn:       "empty_result_target",
			Status:         StatusActive,
		},
		{
			ID:             3,
			TargetContract: "CDSBDXYELFFHM7XMG4D4BXEVETOHQDWPQOTQLPRHGTTVW7DTNODHIIZN",
			TargetFn:       "harvest_yield",
			Status:         StatusActive,
		},
	}

	executed := daemon.ProcessCandidateJobs(candidates)

	if got := atomic.LoadInt32(&simulateCalls); got != 3 {
		t.Fatalf("expected 3 simulateTransaction calls, got %d", got)
	}
	if got := atomic.LoadInt32(&executeCalls); got != 1 {
		t.Fatalf("expected 1 sendTransaction call for healthy job, got %d", got)
	}
	if len(executed) != 1 || executed[0] != 3 {
		t.Fatalf("expected only job #3 to be executed, got %v", executed)
	}
}
