package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

type KeeperDaemon struct {
	config     *Config
	client     *RPCClient
	mu         sync.RWMutex
	jobsQueue  []*Job
	txBuilder  func(job *Job) (string, error)
	executorFn func(job *Job, preparedTxXdr string, simResult *SimulateTransactionResult) error
}

func NewKeeperDaemon(cfg *Config) *KeeperDaemon {
	d := &KeeperDaemon{
		config:    cfg,
		client:    NewRPCClient(cfg.RPCURL),
		jobsQueue: make([]*Job, 0),
	}
	d.txBuilder = d.defaultBuildExecuteJobTx
	d.executorFn = d.defaultSubmitJobTx
	return d
}

func (d *KeeperDaemon) defaultBuildExecuteJobTx(job *Job) (string, error) {
	if job == nil {
		return "", fmt.Errorf("job cannot be nil")
	}
	engineID := "CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT"
	if d.config != nil && d.config.JobEngineId != "" {
		engineID = d.config.JobEngineId
	}
	return BuildExecuteJobEnvelopeXDR(engineID, job.ID)
}

func (d *KeeperDaemon) defaultSubmitJobTx(job *Job, preparedTxXdr string, simResult *SimulateTransactionResult) error {
	if d.client == nil {
		return fmt.Errorf("rpc client is nil")
	}
	sendRes, err := d.client.SendTransaction(preparedTxXdr)
	if err != nil {
		return fmt.Errorf("sendTransaction failed for job #%d: %w", job.ID, err)
	}
	status := strings.ToUpper(strings.TrimSpace(sendRes.Status))
	if status != "PENDING" && status != "SUCCESS" {
		return fmt.Errorf("sendTransaction rejected for job #%d (status=%s, errorXdr=%s)", job.ID, sendRes.Status, sendRes.ErrorResultXdr)
	}
	if sendRes.ErrorResultXdr != "" {
		return fmt.Errorf("sendTransaction returned errorResultXdr for job #%d: %s", job.ID, sendRes.ErrorResultXdr)
	}
	log.Printf("[Keeper] [INFO] Submitted execute_job transaction for Job #%d (hash=%s, status=%s, minResourceFee=%s)",
		job.ID, sendRes.Hash, sendRes.Status, simResult.MinResourceFee)
	return nil
}

// SetCandidateJobs configures the queue of candidate jobs to evaluate on the next polling cycle.
func (d *KeeperDaemon) SetCandidateJobs(jobs []*Job) {
	d.mu.Lock()
	defer d.mu.Unlock()
	copied := make([]*Job, len(jobs))
	copy(copied, jobs)
	d.jobsQueue = copied
}

// SetTxBuilder overrides the transaction envelope builder used for pre-execution simulation and submission.
func (d *KeeperDaemon) SetTxBuilder(builder func(job *Job) (string, error)) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.txBuilder = builder
}

// SetExecutor overrides the on-chain execution handler invoked after a job passes pre-simulation.
func (d *KeeperDaemon) SetExecutor(fn func(job *Job, preparedTxXdr string, simResult *SimulateTransactionResult) error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.executorFn = fn
}

// PreSimulateJob performs a pre-execution dry-run of execute_job via Soroban simulateTransaction.
// If simulation returns a HostError, contract panic (Error(Contract, #...)), or state restoration requirement,
// it logs a structured warning with the job ID and diagnostic reason and returns (nil, false, nil) so the
// keeper skips on-chain submission without wasting gas fees.
func (d *KeeperDaemon) PreSimulateJob(job *Job, txXdr string) (*SimulateTransactionResult, bool, error) {
	if job == nil {
		return nil, false, fmt.Errorf("job cannot be nil")
	}
	if d.client == nil {
		return nil, false, fmt.Errorf("rpc client cannot be nil")
	}

	simResult, err := d.client.SimulateTransaction(txXdr)
	if err != nil {
		log.Printf("[Keeper] [WARN] job_id=%d target=%s::%s pre-execution simulation RPC error: %v (skipping execution)",
			job.ID, job.TargetContract, job.TargetFn, err)
		return nil, false, err
	}

	ok, reason := simResult.Validate()
	if !ok {
		log.Printf("[Keeper] [WARN] job_id=%d target=%s::%s pre-execution simulation failed (%s); skipping ExecuteJob to avoid wasted gas fees",
			job.ID, job.TargetContract, job.TargetFn, reason)
		return simResult, false, nil
	}

	log.Printf("[Keeper] [INFO] job_id=%d target=%s::%s passed pre-execution simulation (minResourceFee=%s)",
		job.ID, job.TargetContract, job.TargetFn, simResult.MinResourceFee)
	return simResult, true, nil
}

// SimulateJobExecution is a convenience wrapper around PreSimulateJob returning (canExecute, error).
func (d *KeeperDaemon) SimulateJobExecution(job *Job, txXdr string) (bool, error) {
	_, ok, err := d.PreSimulateJob(job, txXdr)
	return ok, err
}

// ExecuteJob submits a pre-simulated job transaction on-chain using the configured executor.
func (d *KeeperDaemon) ExecuteJob(job *Job, preparedTxXdr string, simResult *SimulateTransactionResult) error {
	if job == nil {
		return fmt.Errorf("job cannot be nil")
	}
	if simResult == nil {
		return fmt.Errorf("cannot execute job #%d without a verified simulation result", job.ID)
	}
	if ok, reason := simResult.Validate(); !ok {
		return fmt.Errorf("refusing to execute job #%d with failed simulation: %s", job.ID, reason)
	}
	trimmedTx := strings.TrimSpace(preparedTxXdr)
	if simResult.SimulatedTxXDR != "" && simResult.SimulatedTxXDR != trimmedTx {
		return fmt.Errorf("refusing to execute job #%d: prepared transaction XDR does not match simulated envelope", job.ID)
	}

	d.mu.RLock()
	executor := d.executorFn
	d.mu.RUnlock()

	if executor == nil {
		executor = d.defaultSubmitJobTx
	}

	return executor(job, trimmedTx, simResult)
}

// ProcessCandidateJobs iterates over candidate jobs, running PreSimulateJob before ExecuteJob.
// Jobs that fail pre-simulation are skipped with a structured warning while remaining healthy jobs proceed.
func (d *KeeperDaemon) ProcessCandidateJobs(jobs []*Job) (executed int, skipped int) {
	d.mu.RLock()
	builder := d.txBuilder
	d.mu.RUnlock()

	if builder == nil {
		builder = d.defaultBuildExecuteJobTx
	}

	for _, job := range jobs {
		if job == nil {
			continue
		}
		if job.Active != nil && !*job.Active {
			skipped++
			continue
		}

		txXdr, buildErr := builder(job)
		if buildErr != nil {
			log.Printf("[Keeper] [WARN] job_id=%d failed to build execute_job transaction: %v (skipping)", job.ID, buildErr)
			skipped++
			continue
		}

		simResult, canExecute, simErr := d.PreSimulateJob(job, txXdr)
		if simErr != nil || !canExecute {
			skipped++
			continue
		}

		if execErr := d.ExecuteJob(job, txXdr, simResult); execErr != nil {
			log.Printf("[Keeper] [ERROR] job_id=%d ExecuteJob failed: %v", job.ID, execErr)
			skipped++
			continue
		}

		executed++
	}

	return executed, skipped
}

func (d *KeeperDaemon) Start() {
	log.Printf("Starting Takt Keeper Daemon (Network: %s, Poll Interval: %ds)", d.config.RPCURL, d.config.PollIntervalSeconds)

	// Start HTTP health server
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "healthy",
			"service": "takt-keeper",
		})
	})

	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", d.config.APIPort),
		Handler: mux,
	}

	go func() {
		log.Printf("Keeper health & metrics server listening on port %d", d.config.APIPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	intervalSec := d.config.PollIntervalSeconds
	if intervalSec <= 0 {
		intervalSec = 10
	}
	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	defer ticker.Stop()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case <-ticker.C:
			d.pollAndExecuteJobs()
		case <-quit:
			log.Println("Shutting down Takt Keeper Daemon gracefully...")
			return
		}
	}
}

func (d *KeeperDaemon) pollAndExecuteJobs() {
	log.Println("[Keeper] Polling Soroban RPC for executable jobs...")

	d.mu.RLock()
	jobs := make([]*Job, len(d.jobsQueue))
	copy(jobs, d.jobsQueue)
	d.mu.RUnlock()

	if len(jobs) == 0 {
		return
	}

	executed, skipped := d.ProcessCandidateJobs(jobs)
	log.Printf("[Keeper] Poll cycle complete: executed=%d skipped=%d", executed, skipped)
}

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load keeper configuration: %v", err)
	}

	daemon := NewKeeperDaemon(cfg)
	daemon.Start()
}
