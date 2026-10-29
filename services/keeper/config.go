package main

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	RPCURL              string
	KeeperSecret        string
	PollIntervalSeconds int
	APIPort             int
	KeeperRegistryId    string
	BountyVaultId       string
	JobEngineId         string
}

func LoadConfig() (*Config, error) {
	rpcURL := os.Getenv("TAKT_RPC_URL")
	if rpcURL == "" {
		rpcURL = "https://soroban-testnet.stellar.org"
	}

	keeperSecret := os.Getenv("TAKT_KEEPER_SECRET")
	if keeperSecret == "" {
		return nil, fmt.Errorf("TAKT_KEEPER_SECRET environment variable is required")
	}

	pollInterval := 10
	if val := os.Getenv("TAKT_POLL_INTERVAL_SECONDS"); val != "" {
		parsed, err := strconv.Atoi(val)
		if err != nil {
			return nil, fmt.Errorf("invalid TAKT_POLL_INTERVAL_SECONDS: %w", err)
		}
		pollInterval = parsed
	}

	apiPort := 8080
	if val := os.Getenv("TAKT_API_PORT"); val != "" {
		parsed, err := strconv.Atoi(val)
		if err != nil {
			return nil, fmt.Errorf("invalid TAKT_API_PORT: %w", err)
		}
		apiPort = parsed
	}

	registryId := os.Getenv("VITE_KEEPER_REGISTRY_ID")
	if registryId == "" {
		registryId = "CCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB"
	}

	vaultId := os.Getenv("VITE_BOUNTY_VAULT_ID")
	if vaultId == "" {
		vaultId = "CCBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
	}

	engineId := os.Getenv("VITE_JOB_ENGINE_ID")
	if engineId == "" {
		engineId = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"
	}

	return &Config{
		RPCURL:              rpcURL,
		KeeperSecret:        keeperSecret,
		PollIntervalSeconds: pollInterval,
		APIPort:             apiPort,
		KeeperRegistryId:    registryId,
		BountyVaultId:       vaultId,
		JobEngineId:         engineId,
	}, nil
}
