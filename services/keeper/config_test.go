package main

import (
	"os"
	"strings"
	"testing"
)

func cleanBaseEnv(t *testing.T) {
	t.Helper()
	keys := []string{
		"TAKT_RPC_URL", "SOROBAN_RPC_URL",
		"TAKT_KEEPER_SECRET", "KEEPER_SECRET_KEY",
		"TAKT_POLL_INTERVAL_SECONDS", "KEEPER_POLL_INTERVAL_SECONDS",
		"TAKT_API_PORT", "KEEPER_HEALTH_PORT",
		"TAKT_KEEPER_REGISTRY_ID", "VITE_KEEPER_REGISTRY_ID",
		"TAKT_BOUNTY_VAULT_ID", "VITE_BOUNTY_VAULT_ID",
		"TAKT_JOB_ENGINE_ID", "VITE_JOB_ENGINE_ID",
	}
	for _, k := range keys {
		// Use os.Unsetenv and register restoration with t.Cleanup
		val, exists := os.LookupEnv(k)
		os.Unsetenv(k)
		if exists {
			capturedKey := k
			capturedVal := val
			t.Cleanup(func() {
				os.Setenv(capturedKey, capturedVal)
			})
		}
	}
}

func TestLoadConfig_MissingSecret(t *testing.T) {
	cleanBaseEnv(t)

	cfg, err := LoadConfig()
	if err == nil {
		t.Fatalf("expected error when secret is missing, got nil")
	}
	if cfg != nil {
		t.Errorf("expected nil config on error, got %+v", cfg)
	}
	expectedMsg := "TAKT_KEEPER_SECRET or KEEPER_SECRET_KEY environment variable is required"
	if err.Error() != expectedMsg {
		t.Errorf("expected error %q, got %q", expectedMsg, err.Error())
	}
}

func TestLoadConfig_Defaults(t *testing.T) {
	cleanBaseEnv(t)
	t.Setenv("TAKT_KEEPER_SECRET", "SDEMO1234567890")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected successful LoadConfig, got: %v", err)
	}

	if cfg.RPCURL != "https://soroban-testnet.stellar.org" {
		t.Errorf("unexpected default RPCURL: %s", cfg.RPCURL)
	}
	if cfg.KeeperSecret != "SDEMO1234567890" {
		t.Errorf("unexpected KeeperSecret: %s", cfg.KeeperSecret)
	}
	if cfg.PollIntervalSeconds != 10 {
		t.Errorf("unexpected default PollIntervalSeconds: %d", cfg.PollIntervalSeconds)
	}
	if cfg.APIPort != 8080 {
		t.Errorf("unexpected default APIPort: %d", cfg.APIPort)
	}
	if cfg.KeeperRegistryId != "CDSBDXYELFFHM7XMG4D4BXEVETOHQDWPQOTQLPRHGTTVW7DTNODHIIZN" {
		t.Errorf("unexpected default KeeperRegistryId: %s", cfg.KeeperRegistryId)
	}
	if cfg.BountyVaultId != "CDDIJAZCXR7TWSTI4B2FSE7MCXFKH2JVOBT4WELSSJLZHV5XQ4PKHEGO" {
		t.Errorf("unexpected default BountyVaultId: %s", cfg.BountyVaultId)
	}
	if cfg.JobEngineId != "CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT" {
		t.Errorf("unexpected default JobEngineId: %s", cfg.JobEngineId)
	}
}

func TestLoadConfig_PrioritizesTaktPrefix(t *testing.T) {
	cleanBaseEnv(t)

	t.Setenv("TAKT_RPC_URL", "https://takt-custom-rpc.stellar.org")
	t.Setenv("SOROBAN_RPC_URL", "https://fallback-rpc.stellar.org")

	t.Setenv("TAKT_KEEPER_SECRET", "STAKTSECRET")
	t.Setenv("KEEPER_SECRET_KEY", "SFALLBACKSECRET")

	t.Setenv("TAKT_POLL_INTERVAL_SECONDS", "30")
	t.Setenv("KEEPER_POLL_INTERVAL_SECONDS", "invalid_ignored")

	t.Setenv("TAKT_API_PORT", "9090")
	t.Setenv("KEEPER_HEALTH_PORT", "invalid_ignored")

	t.Setenv("TAKT_KEEPER_REGISTRY_ID", "CTAKTREGISTRY")
	t.Setenv("VITE_KEEPER_REGISTRY_ID", "CFALLBACKREGISTRY")

	t.Setenv("TAKT_BOUNTY_VAULT_ID", "CTAKTVAULT")
	t.Setenv("VITE_BOUNTY_VAULT_ID", "CFALLBACKVAULT")

	t.Setenv("TAKT_JOB_ENGINE_ID", "CTAKTENGINE")
	t.Setenv("VITE_JOB_ENGINE_ID", "CFALLBACKENGINE")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected successful LoadConfig, got: %v", err)
	}

	if cfg.RPCURL != "https://takt-custom-rpc.stellar.org" {
		t.Errorf("expected TAKT_RPC_URL priority, got: %s", cfg.RPCURL)
	}
	if cfg.KeeperSecret != "STAKTSECRET" {
		t.Errorf("expected TAKT_KEEPER_SECRET priority, got: %s", cfg.KeeperSecret)
	}
	if cfg.PollIntervalSeconds != 30 {
		t.Errorf("expected TAKT_POLL_INTERVAL_SECONDS priority, got: %d", cfg.PollIntervalSeconds)
	}
	if cfg.APIPort != 9090 {
		t.Errorf("expected TAKT_API_PORT priority, got: %d", cfg.APIPort)
	}
	if cfg.KeeperRegistryId != "CTAKTREGISTRY" {
		t.Errorf("expected TAKT_KEEPER_REGISTRY_ID priority, got: %s", cfg.KeeperRegistryId)
	}
	if cfg.BountyVaultId != "CTAKTVAULT" {
		t.Errorf("expected TAKT_BOUNTY_VAULT_ID priority, got: %s", cfg.BountyVaultId)
	}
	if cfg.JobEngineId != "CTAKTENGINE" {
		t.Errorf("expected TAKT_JOB_ENGINE_ID priority, got: %s", cfg.JobEngineId)
	}
}

func TestLoadConfig_Fallbacks(t *testing.T) {
	cleanBaseEnv(t)

	t.Setenv("SOROBAN_RPC_URL", "https://fallback-rpc.stellar.org")
	t.Setenv("KEEPER_SECRET_KEY", "SFALLBACKSECRET")
	t.Setenv("KEEPER_POLL_INTERVAL_SECONDS", "45")
	t.Setenv("KEEPER_HEALTH_PORT", "7777")
	t.Setenv("VITE_KEEPER_REGISTRY_ID", "CFALLBACKREGISTRY")
	t.Setenv("VITE_BOUNTY_VAULT_ID", "CFALLBACKVAULT")
	t.Setenv("VITE_JOB_ENGINE_ID", "CFALLBACKENGINE")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected successful LoadConfig, got: %v", err)
	}

	if cfg.RPCURL != "https://fallback-rpc.stellar.org" {
		t.Errorf("expected fallback RPCURL, got: %s", cfg.RPCURL)
	}
	if cfg.KeeperSecret != "SFALLBACKSECRET" {
		t.Errorf("expected fallback KeeperSecret, got: %s", cfg.KeeperSecret)
	}
	if cfg.PollIntervalSeconds != 45 {
		t.Errorf("expected fallback PollIntervalSeconds, got: %d", cfg.PollIntervalSeconds)
	}
	if cfg.APIPort != 7777 {
		t.Errorf("expected fallback APIPort, got: %d", cfg.APIPort)
	}
	if cfg.KeeperRegistryId != "CFALLBACKREGISTRY" {
		t.Errorf("expected fallback KeeperRegistryId, got: %s", cfg.KeeperRegistryId)
	}
	if cfg.BountyVaultId != "CFALLBACKVAULT" {
		t.Errorf("expected fallback BountyVaultId, got: %s", cfg.BountyVaultId)
	}
	if cfg.JobEngineId != "CFALLBACKENGINE" {
		t.Errorf("expected fallback JobEngineId, got: %s", cfg.JobEngineId)
	}
}

func TestLoadConfig_InvalidNumbers(t *testing.T) {
	testCases := []struct {
		name       string
		envKey     string
		envVal     string
		errSegment string
	}{
		{"invalid TAKT_POLL_INTERVAL_SECONDS", "TAKT_POLL_INTERVAL_SECONDS", "not_a_number", "invalid TAKT_POLL_INTERVAL_SECONDS"},
		{"invalid TAKT_API_PORT", "TAKT_API_PORT", "port_bad", "invalid TAKT_API_PORT"},
		{"invalid KEEPER_POLL_INTERVAL_SECONDS", "KEEPER_POLL_INTERVAL_SECONDS", "float_12.5", "invalid KEEPER_POLL_INTERVAL_SECONDS"},
		{"invalid KEEPER_HEALTH_PORT", "KEEPER_HEALTH_PORT", "xyz", "invalid KEEPER_HEALTH_PORT"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			cleanBaseEnv(t)
			t.Setenv("TAKT_KEEPER_SECRET", "SVALIDSECRET")
			t.Setenv(tc.envKey, tc.envVal)

			cfg, err := LoadConfig()
			if err == nil {
				t.Fatalf("expected error for %s (%s=%s), got nil", tc.name, tc.envKey, tc.envVal)
			}
			if cfg != nil {
				t.Errorf("expected nil config on error, got %+v", cfg)
			}
			if !strings.Contains(err.Error(), tc.errSegment) {
				t.Errorf("expected error message containing %q, got %q", tc.errSegment, err.Error())
			}
		})
	}
}
