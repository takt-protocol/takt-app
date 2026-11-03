package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"
)

type KeeperMetrics struct {
	PollsTotal          uint64 `json:"polls_total"`
	ExecutionsAttempted uint64 `json:"executions_attempted"`
	ExecutionsSucceeded uint64 `json:"executions_succeeded"`
	LastPollTimestamp   int64  `json:"last_poll_timestamp"`
}

type KeeperDaemon struct {
	config              *Config
	client              *RPCClient
	pollsTotal          atomic.Uint64
	executionsAttempted atomic.Uint64
	executionsSucceeded atomic.Uint64
	lastPollTimestamp   atomic.Int64
}

func NewKeeperDaemon(cfg *Config) *KeeperDaemon {
	return &KeeperDaemon{
		config: cfg,
		client: NewRPCClient(cfg.RPCURL),
	}
}

func (d *KeeperDaemon) Metrics() KeeperMetrics {
	return KeeperMetrics{
		PollsTotal:          d.pollsTotal.Load(),
		ExecutionsAttempted: d.executionsAttempted.Load(),
		ExecutionsSucceeded: d.executionsSucceeded.Load(),
		LastPollTimestamp:   d.lastPollTimestamp.Load(),
	}
}

func (d *KeeperDaemon) RecordExecution(succeeded bool) {
	d.executionsAttempted.Add(1)
	if succeeded {
		d.executionsSucceeded.Add(1)
	}
}

func (d *KeeperDaemon) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "healthy",
		"service": "takt-keeper",
	})
}

func (d *KeeperDaemon) handleMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(d.Metrics())
}

func (d *KeeperDaemon) NewServeMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", d.handleHealth)
	mux.HandleFunc("/metrics", d.handleMetrics)
	return mux
}

func (d *KeeperDaemon) Start() {
	log.Printf("Starting Takt Keeper Daemon (Network: %s, Poll Interval: %ds)", d.config.RPCURL, d.config.PollIntervalSeconds)

	// Start HTTP health & metrics server
	mux := d.NewServeMux()

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

func (d *KeeperDaemon) pollAndExecuteJobs() {
	d.pollsTotal.Add(1)
	d.lastPollTimestamp.Store(time.Now().Unix())
	log.Println("[Keeper] Polling Soroban RPC for executable jobs...")
	// In production, this queries JobEngine contract state and submits execute_job transactions
}

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load keeper configuration: %v", err)
	}

	daemon := NewKeeperDaemon(cfg)
	daemon.Start()
}
