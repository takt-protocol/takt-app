package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func TestSimulateTransaction_Success(t *testing.T) {
	var callCount int32
	var handlerMu sync.Mutex
	var handlerErr string

	// Valid Base64 XDR: "AAAAAQ==" decodes to [0, 0, 0, 1]
	// Valid Base64 transactionData: "AAAAAgAAAAE="
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&callCount, 1)

		if r.Method != http.MethodPost {
			handlerMu.Lock()
			handlerErr = "expected POST method"
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
			handlerErr = "failed to read body"
			handlerMu.Unlock()
			return
		}

		var rpcReq JSONRPCRequest
		if err := json.Unmarshal(bodyBytes, &rpcReq); err != nil {
			handlerMu.Lock()
			handlerErr = "failed to decode request JSON"
			handlerMu.Unlock()
			return
		}
		if rpcReq.Method != "simulateTransaction" {
			handlerMu.Lock()
			handlerErr = "expected RPC method simulateTransaction"
			handlerMu.Unlock()
		}

		params, ok := rpcReq.Params.(map[string]interface{})
		if !ok || params["transaction"] != "AAAAAgAAAAE=" {
			handlerMu.Lock()
			handlerErr = "expected transaction parameter AAAAAgAAAAE="
			handlerMu.Unlock()
		}

		resp := JSONRPCResponse{
			Jsonrpc: "2.0",
			ID:      1,
			Result: json.RawMessage(`{
				"transactionData": "AAAAAgAAAAE=",
				"minResourceFee": "15000",
				"results": [
					{
						"auth": [],
						"xdr": "AAAAAQ=="
					}
				],
				"latestLedger": 12345
			}`),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewRPCClient(server.URL)
	daemon := &KeeperDaemon{
		client: client,
	}

	job := &Job{
		ID:             42,
		TargetContract: "CDDIJAZCXR7TWSTI4B2FSE7MCXFKH2JVOBT4WELSSJLZHV5XQ4PKHEGO",
		TargetFn:       "rebalance",
	}

	result, err := client.SimulateTransaction("AAAAAgAAAAE=")
	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}

	handlerMu.Lock()
	if handlerErr != "" {
		t.Errorf("handler validation failed: %s", handlerErr)
	}
	handlerMu.Unlock()

	if result.MinResourceFee != "15000" {
		t.Errorf("expected minResourceFee 15000, got: %s", result.MinResourceFee)
	}

	ok, reason := result.IsSuccessful()
	if !ok {
		t.Errorf("expected successful simulation, got false with reason: %s", reason)
	}

	canExecute, err := daemon.SimulateJobExecution(job, "AAAAAgAAAAE=")
	if err != nil {
		t.Fatalf("expected nil error from daemon simulation, got: %v", err)
	}
	if !canExecute {
		t.Errorf("expected job #42 to be approved for execution, but was skipped")
	}

	if atomic.LoadInt32(&callCount) != 2 {
		t.Errorf("expected exactly 2 RPC calls, got %d", callCount)
	}
}

func TestSimulateTransaction_HostError(t *testing.T) {
	// Stellar RPC format: on simulation failure, 'error' is populated and results/transactionData are absent
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := JSONRPCResponse{
			Jsonrpc: "2.0",
			ID:      1,
			Result: json.RawMessage(`{
				"error": "HostError: Error(Contract, #12)"
			}`),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewRPCClient(server.URL)
	daemon := &KeeperDaemon{
		client: client,
	}

	job := &Job{
		ID:             77,
		TargetContract: "CDDIJAZCXR7TWSTI4B2FSE7MCXFKH2JVOBT4WELSSJLZHV5XQ4PKHEGO",
		TargetFn:       "panic_call",
	}

	result, err := client.SimulateTransaction("AAAAAgAAAAE=")
	if err != nil {
		t.Fatalf("expected nil error on HTTP call, got: %v", err)
	}

	ok, reason := result.IsSuccessful()
	if ok {
		t.Errorf("expected simulation to fail, but got true")
	}
	if !strings.Contains(reason, "Error(Contract, #12)") {
		t.Errorf("expected reason to contain 'Error(Contract, #12)', got: %s", reason)
	}

	canExecute, err := daemon.SimulateJobExecution(job, "AAAAAgAAAAE=")
	if err != nil {
		t.Fatalf("expected nil error (graceful skip), got: %v", err)
	}
	if canExecute {
		t.Errorf("expected reverting job #77 to be skipped, but got canExecute = true")
	}
}

func TestSimulateTransaction_InvocationError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := JSONRPCResponse{
			Jsonrpc: "2.0",
			ID:      1,
			Result: json.RawMessage(`{
				"error": "Error(Contract, #4): Insufficient balance"
			}`),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewRPCClient(server.URL)
	daemon := &KeeperDaemon{client: client}
	job := &Job{ID: 99}

	result, err := client.SimulateTransaction("AAAAAgAAAAE=")
	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}

	ok, reason := result.IsSuccessful()
	if ok {
		t.Errorf("expected invocation error to fail simulation, got true")
	}
	if !strings.Contains(reason, "Insufficient balance") {
		t.Errorf("expected reason to contain 'Insufficient balance', got: %s", reason)
	}

	canExecute, err := daemon.SimulateJobExecution(job, "AAAAAgAAAAE=")
	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
	if canExecute {
		t.Errorf("expected job #99 to be skipped, but got canExecute = true")
	}
}

func TestSimulateTransaction_RestorePreamble(t *testing.T) {
	// A transaction requiring state restoration before invocation must fail closed
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := JSONRPCResponse{
			Jsonrpc: "2.0",
			ID:      1,
			Result: json.RawMessage(`{
				"transactionData": "AAAAAgAAAAE=",
				"minResourceFee": "5000",
				"restorePreamble": {
					"minResourceFee": "5000",
					"transactionData": "AAAAAgAAAAE="
				},
				"results": [{"xdr": "AAAAAQ=="}]
			}`),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewRPCClient(server.URL)
	result, err := client.SimulateTransaction("AAAAAgAAAAE=")
	if err != nil {
		t.Fatalf("expected nil error on RPC call, got: %v", err)
	}

	ok, reason := result.IsSuccessful()
	if ok {
		t.Errorf("expected restorePreamble to fail simulation, got ok = true")
	}
	if !strings.Contains(reason, "state restoration") {
		t.Errorf("expected 'state restoration' reason, got: %s", reason)
	}
}

func TestSimulateTransaction_RPCFailure(t *testing.T) {
	// HTTP 500 rejection
	server500 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error": "node internal error"}`))
	}))
	defer server500.Close()

	client500 := NewRPCClient(server500.URL)
	daemon500 := &KeeperDaemon{client: client500}

	job := &Job{ID: 101}
	canExecute, err := daemon500.SimulateJobExecution(job, "AAAAAgAAAAE=")
	if err == nil {
		t.Errorf("expected error on RPC failure, got nil")
	}
	if canExecute {
		t.Errorf("expected canExecute to be false on RPC error")
	}

	// JSON-RPC level error
	serverRPCError := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"jsonrpc": "2.0", "id": 1, "error": {"code": -32600, "message": "Invalid Request"}}`))
	}))
	defer serverRPCError.Close()

	clientRPCError := NewRPCClient(serverRPCError.URL)
	_, errRPC := clientRPCError.SimulateTransaction("AAAAAgAAAAE=")
	if errRPC == nil || !strings.Contains(errRPC.Error(), "Invalid Request") {
		t.Errorf("expected JSON-RPC error rejection, got: %v", errRPC)
	}
}

func TestSimulateTransaction_NilResult(t *testing.T) {
	var result *SimulateTransactionResult
	ok, reason := result.IsSuccessful()
	if ok || reason != "nil simulation result" {
		t.Errorf("expected (false, 'nil simulation result'), got (%v, '%s')", ok, reason)
	}

	daemon := &KeeperDaemon{}
	canExecute, err := daemon.SimulateJobExecution(nil, "AAAAAgAAAAE=")
	if err == nil {
		t.Errorf("expected error for nil job, got nil")
	}
	if canExecute {
		t.Errorf("expected false for nil job")
	}
}

func TestProcessCandidateJobs_IntegrationSimulationGate(t *testing.T) {
	// Proves safety property: Reverting jobs are skipped without panic,
	// while subsequent healthy jobs execute properly in the same loop,
	// receiving the exact prepared transaction.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req JSONRPCRequest
		json.NewDecoder(r.Body).Decode(&req)
		params, _ := req.Params.(map[string]interface{})
		tx, _ := params["transaction"].(string)

		w.Header().Set("Content-Type", "application/json")
		if tx == "reverting_tx_xdr" {
			json.NewEncoder(w).Encode(JSONRPCResponse{
				Jsonrpc: "2.0",
				ID:      1,
				Result: json.RawMessage(`{"error": "HostError: Error(Contract, #12)"}`),
			})
		} else {
			json.NewEncoder(w).Encode(JSONRPCResponse{
				Jsonrpc: "2.0",
				ID:      1,
				Result: json.RawMessage(`{"transactionData": "AAAAAgAAAAE=", "minResourceFee": "15000", "results": [{"xdr": "AAAAAQ=="}]}`),
			})
		}
	}))
	defer server.Close()

	var execMu sync.Mutex
	executedJobs := make([]uint64, 0)
	executedTxs := make([]string, 0)

	daemon := &KeeperDaemon{
		client: NewRPCClient(server.URL),
	}
	daemon.SetExecutor(func(job *Job, preparedTx string) error {
		execMu.Lock()
		defer execMu.Unlock()
		executedJobs = append(executedJobs, job.ID)
		executedTxs = append(executedTxs, preparedTx)
		return nil
	})

	jobs := []*Job{
		{ID: 1, TargetContract: "ContractA", TargetFn: "panic_fn"},
		{ID: 2, TargetContract: "ContractB", TargetFn: "healthy_fn"},
	}

	txBuilder := func(job *Job) string {
		if job.ID == 1 {
			return "reverting_tx_xdr"
		}
		return "healthy_tx_xdr"
	}

	executedCount, skippedCount := daemon.ProcessCandidateJobs(jobs, txBuilder)

	if executedCount != 1 {
		t.Errorf("expected 1 job executed, got %d", executedCount)
	}
	if skippedCount != 1 {
		t.Errorf("expected 1 job skipped, got %d", skippedCount)
	}

	execMu.Lock()
	if len(executedJobs) != 1 || executedJobs[0] != 2 {
		t.Errorf("expected only healthy job #2 to execute, got: %v", executedJobs)
	}
	if len(executedTxs) != 1 || executedTxs[0] != "healthy_tx_xdr" {
		t.Errorf("expected executor to receive simulated tx 'healthy_tx_xdr', got: %v", executedTxs)
	}
	execMu.Unlock()

	// Test consecutive polling execution through pollAndExecuteJobs
	daemon.SetCandidateJobs(jobs)
	daemon.SetTxBuilder(txBuilder)
	daemon.pollAndExecuteJobs()

	execMu.Lock()
	if len(executedJobs) != 2 {
		t.Errorf("expected pollAndExecuteJobs to execute second run successfully, total: %d", len(executedJobs))
	}
	execMu.Unlock()
}
