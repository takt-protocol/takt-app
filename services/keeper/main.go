package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

type KeeperDaemon struct {
	config     *Config
	client     *RPCClient
	mu         sync.RWMutex
	jobsQueue  []*Job
	executorFn func(job *Job, preparedTx string) error
	txBuilder  func(job *Job) string

	// Telemetry metrics (thread-safe lock-free sync/atomic counters)
	pollsTotal          uint64
	executionsAttempted uint64
	executionsSucceeded uint64
	lastPollTimestamp   int64
	startTime           int64
}

func NewKeeperDaemon(cfg *Config) *KeeperDaemon {
	return &KeeperDaemon{
		config:    cfg,
		client:    NewRPCClient(cfg.RPCURL),
		jobsQueue: make([]*Job, 0),
		startTime: time.Now().Unix(),
	}
}

func (d *KeeperDaemon) SetCandidateJobs(jobs []*Job) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.jobsQueue = jobs
}

func (d *KeeperDaemon) SetTxBuilder(builder func(job *Job) string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.txBuilder = builder
}

func (d *KeeperDaemon) SetExecutor(fn func(job *Job, preparedTx string) error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.executorFn = fn
}

// GetMetrics returns a snapshot of current telemetry counters.
func (d *KeeperDaemon) GetMetrics() KeeperMetrics {
	now := time.Now().Unix()
	startTime := atomic.LoadInt64(&d.startTime)
	uptime := int64(0)
	if startTime > 0 && now >= startTime {
		uptime = now - startTime
	}

	return KeeperMetrics{
		PollsTotal:          atomic.LoadUint64(&d.pollsTotal),
		ExecutionsAttempted: atomic.LoadUint64(&d.executionsAttempted),
		ExecutionsSucceeded: atomic.LoadUint64(&d.executionsSucceeded),
		LastPollTimestamp:   atomic.LoadInt64(&d.lastPollTimestamp),
		UptimeSeconds:       uptime,
	}
}

// SetupHTTPServer builds and registers HTTP routes for /health and /metrics endpoints,
// enforcing GET method validation with 405 Method Not Allowed and Allow: GET headers.
func (d *KeeperDaemon) SetupHTTPServer() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "healthy",
			"service": "takt-keeper",
		})
	})

	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		metrics := d.GetMetrics()
		json.NewEncoder(w).Encode(metrics)
	})

	return mux
}

func (d *KeeperDaemon) Start() {
	log.Printf("Starting Takt Keeper Daemon (Network: %s, Poll Interval: %ds)", d.config.RPCURL, d.config.PollIntervalSeconds)

	mux := d.SetupHTTPServer()
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

	ticker := time.NewTicker(time.Duration(d.config.PollIntervalSeconds) * time.Second)
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

// SimulateJobExecution performs a pre-flight dry-run of a candidate job via Soroban simulateTransaction.
// If the target contract reverts (e.g. panicking target or contract logic failure), execution is skipped
// to prevent wasting keeper gas fees on reverted transactions.
func (d *KeeperDaemon) SimulateJobExecution(job *Job, txXdr string) (bool, error) {
	if job == nil {
		return false, fmt.Errorf("job cannot be nil")
	}

	simResult, err := d.client.SimulateTransaction(txXdr)
	if err != nil {
		log.Printf("[Keeper] [WARN] RPC error during pre-simulation for Job #%d: %v. Skipping execution.", job.ID, err)
		return false, err
	}

	ok, reason := simResult.IsSuccessful()
	if !ok {
		log.Printf("[Keeper] [WARN] Pre-execution simulation reverted for Job #%d (%s::%s): %s. Skipping on-chain execution to protect keeper fees.",
			job.ID, job.TargetContract, job.TargetFn, reason)
		return false, nil
	}

	log.Printf("[Keeper] [INFO] Job #%d passed pre-execution simulation successfully.", job.ID)
	return true, nil
}

// ProcessCandidateJobs iterates through candidate jobs, pre-simulating each before execution.
// If a job reverts during simulation or encounters a simulation error, it is skipped and logged,
// allowing subsequent healthy jobs in the queue to execute without stalling the daemon.
func (d *KeeperDaemon) ProcessCandidateJobs(jobs []*Job, txBuilder func(job *Job) string) (int, int) {
	d.mu.RLock()
	activeTxBuilder := txBuilder
	if activeTxBuilder == nil {
		activeTxBuilder = d.txBuilder
	}
	activeExecutor := d.executorFn
	d.mu.RUnlock()

	executed := 0
	skipped := 0

	for _, job := range jobs {
		if job == nil {
			continue
		}

		txXdr := ""
		if activeTxBuilder != nil {
			txXdr = activeTxBuilder(job)
		}

		canExecute, err := d.SimulateJobExecution(job, txXdr)
		if err != nil || !canExecute {
			skipped++
			continue
		}

		// Only count attempt and execution when executor is configured and invoked
		if activeExecutor != nil {
			atomic.AddUint64(&d.executionsAttempted, 1)

			if execErr := activeExecutor(job, txXdr); execErr != nil {
				log.Printf("[Keeper] [ERROR] Failed to execute job #%d: %v", job.ID, execErr)
				continue
			}

			atomic.AddUint64(&d.executionsSucceeded, 1)
			executed++
		}
	}

	return executed, skipped
}

func (d *KeeperDaemon) pollAndExecuteJobs() {
	log.Println("[Keeper] Polling Soroban RPC for executable jobs...")
	atomic.AddUint64(&d.pollsTotal, 1)
	atomic.StoreInt64(&d.lastPollTimestamp, time.Now().Unix())

	d.mu.RLock()
	jobs := make([]*Job, len(d.jobsQueue))
	copy(jobs, d.jobsQueue)
	builder := d.txBuilder
	d.mu.RUnlock()

	if len(jobs) > 0 {
		d.ProcessCandidateJobs(jobs, builder)
	}
}

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load keeper configuration: %v", err)
	}

	daemon := NewKeeperDaemon(cfg)
	daemon.Start()
}
