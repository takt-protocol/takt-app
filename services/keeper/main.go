package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

type KeeperDaemon struct {
	config *Config
	client *RPCClient
}

func NewKeeperDaemon(cfg *Config) *KeeperDaemon {
	return &KeeperDaemon{
		config: cfg,
		client: NewRPCClient(cfg.RPCURL),
	}
}

func (d *KeeperDaemon) Start() {
	log.Printf("Starting Takt Keeper Daemon (Network: %s, Poll Interval: %ds)", d.config.RPCURL, d.config.PollIntervalSeconds)
	log.Println("[Keeper] stub: job polling and execution are not implemented; no RPC queries are made")

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

// CanSubmitJobExecution runs pre-execution simulateTransaction before broadcasting sendTransaction.
func (d *KeeperDaemon) CanSubmitJobExecution(jobID uint64, txXdr string) (bool, *SimulateTransactionResult, error) {
	simRes, err := d.client.SimulateTransaction(txXdr)
	if err != nil {
		return false, nil, fmt.Errorf("simulateTransaction failed for job %d: %w", jobID, err)
	}
	if simRes.Error != "" {
		if code, name, ok := ParseJobEngineContractError(simRes.Error); ok {
			log.Printf("[Keeper] skipping job %d submission: simulation reverted with EngineError #%d (%s): %s", jobID, code, name, simRes.Error)
		} else {
			log.Printf("[Keeper] skipping job %d submission: simulation failed: %s", jobID, simRes.Error)
		}
		return false, simRes, nil
	}
	return true, simRes, nil
}

func (d *KeeperDaemon) pollAndExecuteJobs() {
	log.Println("[Keeper] stub: job polling and execution are not implemented; no RPC queries are made")
	// In production, this queries JobEngine contract state, runs CanSubmitJobExecution, and submits execute_job transactions
}

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load keeper configuration: %v", err)
	}

	daemon := NewKeeperDaemon(cfg)
	daemon.Start()
}
