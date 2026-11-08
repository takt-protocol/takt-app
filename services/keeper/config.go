package main

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	RPCURL              string
	KeeperSecret        string
	PollIntervalSeconds int
	APIPort             int
	KeeperRegistryId    string
	BountyVaultId       string
	JobEngineId         string
	RPCMaxRetries       int
	RPCBaseDelay        time.Duration
}

func LoadConfig() (*Config, error) {
	rpcURL := os.Getenv("TAKT_RPC_URL")
	if rpcURL == "" {
		rpcURL = os.Getenv("SOROBAN_RPC_URL")
	}
	if rpcURL == "" {
		rpcURL = "https://soroban-testnet.stellar.org"
	}

	keeperSecret := os.Getenv("TAKT_KEEPER_SECRET")
	if keeperSecret == "" {
		keeperSecret = os.Getenv("KEEPER_SECRET_KEY")
	}
	if keeperSecret == "" {
		return nil, fmt.Errorf("TAKT_KEEPER_SECRET or KEEPER_SECRET_KEY environment variable is required")
	}

	pollInterval := 10
	if val := os.Getenv("TAKT_POLL_INTERVAL_SECONDS"); val != "" {
		parsed, err := strconv.Atoi(val)
		if err != nil {
			return nil, fmt.Errorf("invalid TAKT_POLL_INTERVAL_SECONDS: %w", err)
		}
		pollInterval = parsed
	} else if val := os.Getenv("KEEPER_POLL_INTERVAL_SECONDS"); val != "" {
		parsed, err := strconv.Atoi(val)
		if err != nil {
			return nil, fmt.Errorf("invalid KEEPER_POLL_INTERVAL_SECONDS: %w", err)
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
	} else if val := os.Getenv("KEEPER_HEALTH_PORT"); val != "" {
		parsed, err := strconv.Atoi(val)
		if err != nil {
			return nil, fmt.Errorf("invalid KEEPER_HEALTH_PORT: %w", err)
		}
		apiPort = parsed
	}

	registryId := os.Getenv("TAKT_KEEPER_REGISTRY_ID")
	if registryId == "" {
		registryId = os.Getenv("VITE_KEEPER_REGISTRY_ID")
	}
	if registryId == "" {
		registryId = "CDSBDXYELFFHM7XMG4D4BXEVETOHQDWPQOTQLPRHGTTVW7DTNODHIIZN"
	}

	vaultId := os.Getenv("TAKT_BOUNTY_VAULT_ID")
	if vaultId == "" {
		vaultId = os.Getenv("VITE_BOUNTY_VAULT_ID")
	}
	if vaultId == "" {
		vaultId = "CDDIJAZCXR7TWSTI4B2FSE7MCXFKH2JVOBT4WELSSJLZHV5XQ4PKHEGO"
	}

	engineId := os.Getenv("TAKT_JOB_ENGINE_ID")
	if engineId == "" {
		engineId = os.Getenv("VITE_JOB_ENGINE_ID")
	}
	if engineId == "" {
		engineId = "CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT"
	}

	maxRetries := 3
	if val := os.Getenv("TAKT_RPC_MAX_RETRIES"); val != "" {
		parsed, err := strconv.Atoi(val)
		if err != nil || parsed < 0 {
			return nil, fmt.Errorf("invalid TAKT_RPC_MAX_RETRIES: %s", val)
		}
		maxRetries = parsed
	}

	baseDelay := 500 * time.Millisecond
	if val := os.Getenv("TAKT_RPC_BASE_DELAY_MS"); val != "" {
		parsed, err := strconv.Atoi(val)
		if err != nil || parsed <= 0 {
			return nil, fmt.Errorf("invalid TAKT_RPC_BASE_DELAY_MS: %s", val)
		}
		baseDelay = time.Duration(parsed) * time.Millisecond
	}

	return &Config{
		RPCURL:              rpcURL,
		KeeperSecret:        keeperSecret,
		PollIntervalSeconds: pollInterval,
		APIPort:             apiPort,
		KeeperRegistryId:    registryId,
		BountyVaultId:       vaultId,
		JobEngineId:         engineId,
		RPCMaxRetries:       maxRetries,
		RPCBaseDelay:        baseDelay,
	}, nil
}
