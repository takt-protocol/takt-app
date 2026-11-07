package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

const (
	validReturnXDR          = "AAAAAQ=="                 // 4-byte aligned valid base64 XDR ([0,0,0,1])
	validTransactionDataXDR = "AAAAAgAAAAE="             // 8-byte aligned valid base64 XDR ([0,0,0,2,0,0,0,1])
	validEnvelopeXDR        = "AAAAGAAAAAEAAAAAAAAAKg==" // 16-byte aligned valid base64 XDR
)

func TestSimulateTransaction_SuccessAndExecuteJob(t *testing.T) {
	var simCalls int32
	var sendCalls int32
	var handlerMu sync.Mutex
	var handlerErr string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			handlerMu.Lock()
			handlerErr = "expected POST request"
			handlerMu.Unlock()
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			handlerMu.Lock()
			handlerErr = "expected Content-Type application/json"
			handlerMu.Unlock()
		}

		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			handlerMu.Lock()
			handlerErr = "failed to read request body"
			handlerMu.Unlock()
			return
		}

		var req JSONRPCRequest
		if err := json.Unmarshal(bodyBytes, &req); err != nil {
			handlerMu.Lock()
			handlerErr = "failed to unmarshal JSON-RPC request"
			handlerMu.Unlock()
			return
		}

		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "simulateTransaction":
			atomic.AddInt32(&simCalls, 1)
			resp := JSONRPCResponse{
				Jsonrpc: "2.0",
				ID:      req.ID,
				Result: json.RawMessage(`{
					"transactionData": "` + validTransactionDataXDR + `",
					"minResourceFee": "18500",
					"results": [
						{
							"auth": [],
							"xdr": "` + validReturnXDR + `"
						}
					],
					"latestLedger": 54321
				}`),
			}
			_ = json.NewEncoder(w).Encode(resp)
		case "sendTransaction":
			atomic.AddInt32(&sendCalls, 1)
			resp := JSONRPCResponse{
				Jsonrpc: "2.0",
				ID:      req.ID,
				Result: json.RawMessage(`{
					"hash": "tx_hash_job_42",
					"status": "PENDING",
					"latestLedger": 54322
				}`),
			}
			_ = json.NewEncoder(w).Encode(resp)
		default:
			handlerMu.Lock()
			handlerErr = "unexpected RPC method: " + req.Method
			handlerMu.Unlock()
		}
	}))
	defer server.Close()

	cfg := &Config{
		RPCURL:              server.URL,
		KeeperSecret:        "SDEMOKEEPERSECRET",
		PollIntervalSeconds: 10,
		APIPort:             8080,
		JobEngineId:         "CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT",
	}
	daemon := NewKeeperDaemon(cfg)

	job := &Job{
		ID:             42,
		TargetContract: "CDDIJAZCXR7TWSTI4B2FSE7MCXFKH2JVOBT4WELSSJLZHV5XQ4PKHEGO",
		TargetFn:       "harvest",
	}

	txXdr, err := BuildExecuteJobEnvelopeXDR(cfg.JobEngineId, job.ID)
	if err != nil {
		t.Fatalf("unexpected error building envelope XDR: %v", err)
	}

	simRes, canExecute, err := daemon.PreSimulateJob(job, txXdr)
	if err != nil {
		t.Fatalf("expected nil error on PreSimulateJob, got: %v", err)
	}
	if !canExecute {
		t.Fatalf("expected healthy job #42 to pass PreSimulateJob")
	}
	if simRes.MinResourceFee != "18500" {
		t.Errorf("expected minResourceFee 18500, got %s", simRes.MinResourceFee)
	}

	if err := daemon.ExecuteJob(job, txXdr, simRes); err != nil {
		t.Fatalf("expected ExecuteJob to succeed via default sendTransaction path, got: %v", err)
	}

	// Verify ExecuteJob rejects mismatched transaction envelope XDR
	if err := daemon.ExecuteJob(job, validEnvelopeXDR, simRes); err == nil {
		t.Errorf("expected ExecuteJob to reject mismatched transaction envelope XDR")
	}

	handlerMu.Lock()
	if handlerErr != "" {
		t.Errorf("RPC handler assertion error: %s", handlerErr)
	}
	handlerMu.Unlock()

	if atomic.LoadInt32(&simCalls) != 1 {
		t.Errorf("expected 1 simulateTransaction call, got %d", simCalls)
	}
	if atomic.LoadInt32(&sendCalls) != 1 {
		t.Errorf("expected 1 sendTransaction call, got %d", sendCalls)
	}
}

func TestSimulateTransaction_HostErrorAndContractRevert(t *testing.T) {
	cases := []struct {
		name        string
		rpcErrorStr string
		wantSubstr  string
	}{
		{
			name:        "HostError contract panic",
			rpcErrorStr: "HostError: Error(Contract, #12)",
			wantSubstr:  "Error(Contract, #12)",
		},
		{
			name:        "Contract invocation error with diagnostic",
			rpcErrorStr: "Error(Contract, #4): Target contract paused",
			wantSubstr:  "Error(Contract, #4)",
		},
		{
			name:        "WasmVm trap unreachable",
			rpcErrorStr: "HostError: Error(WasmVm, InvalidAction)",
			wantSubstr:  "Error(WasmVm, InvalidAction)",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var sendCalls int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var req JSONRPCRequest
				_ = json.NewDecoder(r.Body).Decode(&req)
				if req.Method == "sendTransaction" {
					atomic.AddInt32(&sendCalls, 1)
				}
				w.Header().Set("Content-Type", "application/json")
				resp := JSONRPCResponse{
					Jsonrpc: "2.0",
					ID:      req.ID,
					Result:  json.RawMessage(`{"error": "` + tc.rpcErrorStr + `", "latestLedger": 54325}`),
				}
				_ = json.NewEncoder(w).Encode(resp)
			}))
			defer server.Close()

			var logBuf bytes.Buffer
			origOut := log.Writer()
			log.SetOutput(&logBuf)
			defer log.SetOutput(origOut)

			daemon := NewKeeperDaemon(&Config{
				RPCURL:      server.URL,
				JobEngineId: "CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT",
			})

			job := &Job{
				ID:             77,
				TargetContract: "CDDIJAZCXR7TWSTI4B2FSE7MCXFKH2JVOBT4WELSSJLZHV5XQ4PKHEGO",
				TargetFn:       "rebalance",
			}

			simRes, canExecute, err := daemon.PreSimulateJob(job, validEnvelopeXDR)
			if err != nil {
				t.Fatalf("expected graceful skip (nil transport error), got: %v", err)
			}
			if canExecute {
				t.Fatalf("expected canExecute=false on %s", tc.name)
			}

			ok, reason := simRes.Validate()
			if ok || !strings.Contains(reason, tc.wantSubstr) {
				t.Errorf("expected Validate() to fail containing %q, got ok=%v reason=%q", tc.wantSubstr, ok, reason)
			}

			logOutput := logBuf.String()
			if !strings.Contains(logOutput, "job_id=77") || !strings.Contains(logOutput, tc.wantSubstr) {
				t.Errorf("expected structured warning log with job_id=77 and %q, got: %s", tc.wantSubstr, logOutput)
			}

			// Verify ExecuteJob refuses to submit a failed simulation result even if called directly
			if execErr := daemon.ExecuteJob(job, validEnvelopeXDR, simRes); execErr == nil {
				t.Errorf("expected ExecuteJob to reject failed simulation result")
			}
			if atomic.LoadInt32(&sendCalls) != 0 {
				t.Errorf("expected 0 sendTransaction calls, got %d", sendCalls)
			}
		})
	}
}

func TestSimulateTransaction_EdgeCasesAndValidation(t *testing.T) {
	t.Run("RestorePreamble required fails closed including empty struct", func(t *testing.T) {
		res := &SimulateTransactionResult{
			TransactionData: validTransactionDataXDR,
			MinResourceFee:  "1000",
			Results:         []SimulationInvocationResult{{Xdr: validReturnXDR}},
			RestorePreamble: &RestorePreamble{},
		}
		ok, reason := res.Validate()
		if ok || !strings.Contains(reason, "restorePreamble") {
			t.Errorf("expected restorePreamble rejection, got ok=%v reason=%q", ok, reason)
		}
	})

	t.Run("Missing or multiple invocation results rejected", func(t *testing.T) {
		emptyRes := &SimulateTransactionResult{
			TransactionData: validTransactionDataXDR,
			MinResourceFee:  "1000",
			Results:         []SimulationInvocationResult{},
		}
		if ok, _ := emptyRes.Validate(); ok {
			t.Errorf("expected empty results slice to be rejected")
		}

		multiRes := &SimulateTransactionResult{
			TransactionData: validTransactionDataXDR,
			MinResourceFee:  "1000",
			Results: []SimulationInvocationResult{
				{Xdr: validReturnXDR},
				{Xdr: validReturnXDR},
			},
		}
		if ok, _ := multiRes.Validate(); ok {
			t.Errorf("expected multiple results to be rejected")
		}
	})

	t.Run("Malformed base64 or non-4-byte aligned XDR rejected", func(t *testing.T) {
		badXdr := &SimulateTransactionResult{
			TransactionData: validTransactionDataXDR,
			MinResourceFee:  "1000",
			Results:         []SimulationInvocationResult{{Xdr: "not-valid-base64!!!"}},
		}
		if ok, _ := badXdr.Validate(); ok {
			t.Errorf("expected invalid base64 return XDR to be rejected")
		}

		unalignedXdr := &SimulateTransactionResult{
			TransactionData: validTransactionDataXDR,
			MinResourceFee:  "1000",
			Results:         []SimulationInvocationResult{{Xdr: "AQID"}}, // 3 bytes [1,2,3], not 4-byte aligned
		}
		if ok, _ := unalignedXdr.Validate(); ok {
			t.Errorf("expected non-4-byte-aligned XDR to be rejected")
		}

		badFee := &SimulateTransactionResult{
			TransactionData: validTransactionDataXDR,
			MinResourceFee:  "-999",
			Results:         []SimulationInvocationResult{{Xdr: validReturnXDR}},
		}
		if ok, _ := badFee.Validate(); ok {
			t.Errorf("expected negative minResourceFee to be rejected")
		}
	})

	t.Run("HTTP 500, JSON-RPC error, null result, and mismatched ID rejected", func(t *testing.T) {
		server500 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{}}`))
		}))
		defer server500.Close()

		client500 := NewRPCClient(server500.URL)
		if _, err := client500.SimulateTransaction(validEnvelopeXDR); err == nil {
			t.Errorf("expected error on HTTP 500 status")
		}

		serverNull := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":null}`))
		}))
		defer serverNull.Close()

		clientNull := NewRPCClient(serverNull.URL)
		if _, err := clientNull.SimulateTransaction(validEnvelopeXDR); err == nil {
			t.Errorf("expected error on null JSON-RPC result")
		}

		serverMismatch := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":999,"result":{}}`))
		}))
		defer serverMismatch.Close()

		clientMismatch := NewRPCClient(serverMismatch.URL)
		if _, err := clientMismatch.SimulateTransaction(validEnvelopeXDR); err == nil || !strings.Contains(err.Error(), "mismatched json-rpc response id") {
			t.Errorf("expected mismatched ID error, got: %v", err)
		}

		serverRPCErr := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var req JSONRPCRequest
			_ = json.NewDecoder(r.Body).Decode(&req)
			w.Header().Set("Content-Type", "application/json")
			resp := JSONRPCResponse{
				Jsonrpc: "2.0",
				ID:      req.ID,
				Error:   &RPCError{Code: -32600, Message: "Invalid Request"},
			}
			_ = json.NewEncoder(w).Encode(resp)
		}))
		defer serverRPCErr.Close()

		clientRPCErr := NewRPCClient(serverRPCErr.URL)
		if _, err := clientRPCErr.SimulateTransaction(validEnvelopeXDR); err == nil || !strings.Contains(err.Error(), "Invalid Request") {
			t.Errorf("expected JSON-RPC error rejection, got: %v", err)
		}
	})
}

func TestKeeperDaemon_PollAndExecuteJobs_SkipsFailingAndExecutesHealthy(t *testing.T) {
	// Configure Job #1 to fail simulation with HostError, Job #2 to pass simulation,
	// and Job #3 to fail simulation with Error(Contract, #9).
	// Verify that Job #1 and Job #3 are skipped with warnings, while Job #2 proceeds to ExecuteJob
	// and the polling loop continues across multiple cycles without crashing.
	job1Tx, _ := BuildExecuteJobEnvelopeXDR("CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT", 1)
	job2Tx, _ := BuildExecuteJobEnvelopeXDR("CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT", 2)
	job3Tx, _ := BuildExecuteJobEnvelopeXDR("CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT", 3)

	var executedJobIDs []uint64
	var execMu sync.Mutex

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req JSONRPCRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		params, _ := req.Params.(map[string]interface{})
		tx, _ := params["transaction"].(string)

		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "simulateTransaction":
			switch tx {
			case job1Tx:
				_ = json.NewEncoder(w).Encode(JSONRPCResponse{
					Jsonrpc: "2.0",
					ID:      req.ID,
					Result:  json.RawMessage(`{"error": "HostError: Error(Contract, #101)"}`),
				})
			case job2Tx:
				_ = json.NewEncoder(w).Encode(JSONRPCResponse{
					Jsonrpc: "2.0",
					ID:      req.ID,
					Result: json.RawMessage(`{
						"transactionData": "` + validTransactionDataXDR + `",
						"minResourceFee": "12000",
						"results": [{"auth": [], "xdr": "` + validReturnXDR + `"}],
						"latestLedger": 9001
					}`),
				})
			case job3Tx:
				_ = json.NewEncoder(w).Encode(JSONRPCResponse{
					Jsonrpc: "2.0",
					ID:      req.ID,
					Result:  json.RawMessage(`{"error": "Error(Contract, #9): interval not elapsed"}`),
				})
			}
		case "sendTransaction":
			execMu.Lock()
			if tx == job2Tx {
				executedJobIDs = append(executedJobIDs, 2)
			} else {
				executedJobIDs = append(executedJobIDs, 999)
			}
			execMu.Unlock()

			_ = json.NewEncoder(w).Encode(JSONRPCResponse{
				Jsonrpc: "2.0",
				ID:      req.ID,
				Result:  json.RawMessage(`{"hash": "hash_job_2", "status": "PENDING", "latestLedger": 9002}`),
			})
		}
	}))
	defer server.Close()

	daemon := NewKeeperDaemon(&Config{
		RPCURL:      server.URL,
		JobEngineId: "CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT",
	})

	candidates := []*Job{
		{ID: 1, TargetContract: "ContractA", TargetFn: "panic_fn"},
		{ID: 2, TargetContract: "ContractB", TargetFn: "healthy_fn"},
		{ID: 3, TargetContract: "ContractC", TargetFn: "early_fn"},
	}

	executed, skipped := daemon.ProcessCandidateJobs(candidates)
	if executed != 1 || skipped != 2 {
		t.Fatalf("expected executed=1 skipped=2, got executed=%d skipped=%d", executed, skipped)
	}

	execMu.Lock()
	if len(executedJobIDs) != 1 || executedJobIDs[0] != 2 {
		t.Fatalf("expected only Job #2 to reach sendTransaction, got: %v", executedJobIDs)
	}
	execMu.Unlock()

	// Verify second polling cycle via pollAndExecuteJobs continues cleanly
	daemon.SetCandidateJobs(candidates)
	daemon.pollAndExecuteJobs()

	execMu.Lock()
	if len(executedJobIDs) != 2 || executedJobIDs[1] != 2 {
		t.Fatalf("expected second poll cycle to execute Job #2 again, got: %v", executedJobIDs)
	}
	execMu.Unlock()
}
