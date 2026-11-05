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

func (d *KeeperDaemon) ProcessCandidateJobs(jobs []Job) []uint64 {
	var executed []uint64
	for _, job := range jobs {
		if job.Status != StatusActive {
			continue
		}

		txXDR := fmt.Sprintf("job:%d:target:%s:fn:%s", job.ID, job.TargetContract, job.TargetFn)
		if _, err := d.client.SimulateExecuteJob(job.ID, txXDR); err != nil {
			log.Printf("[Keeper] WARN skipping job_id=%d target=%s fn=%s pre-simulation failed: %v",
				job.ID, job.TargetContract, job.TargetFn, err)
			continue
		}

		sendResp, err := d.client.ExecuteJob(job.ID, txXDR)
		if err != nil {
			log.Printf("[Keeper] WARN failed broadcasting execute_job for job_id=%d: %v", job.ID, err)
			continue
		}

		log.Printf("[Keeper] INFO executed job_id=%d tx_hash=%s status=%s", job.ID, sendResp.Hash, sendResp.Status)
		executed = append(executed, job.ID)
	}
	return executed
}

func (d *KeeperDaemon) pollAndExecuteJobs() {
	log.Println("[Keeper] Polling Soroban RPC for executable jobs...")
	var jobs []Job
	if err := d.client.Call("getExecutableJobs", map[string]interface{}{
		"jobEngineId": d.config.JobEngineId,
	}, &jobs); err != nil {
		return
	}
	d.ProcessCandidateJobs(jobs)
}

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load keeper configuration: %v", err)
	}

	daemon := NewKeeperDaemon(cfg)
	daemon.Start()
}
