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

func (d *KeeperDaemon) pollAndExecuteJobs() {
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
