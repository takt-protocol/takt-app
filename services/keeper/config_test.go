package main

import (
	"os"
	"testing"
)

func clearKeeperEnv(t *testing.T) {
	t.Helper()
	keys := []string{
		"TAKT_RPC_URL",
		"SOROBAN_RPC_URL",
		"TAKT_KEEPER_SECRET",
		"KEEPER_SECRET_KEY",
		"TAKT_POLL_INTERVAL_SECONDS",
		"KEEPER_POLL_INTERVAL_SECONDS",
		"TAKT_API_PORT",
		"KEEPER_HEALTH_PORT",
		"TAKT_KEEPER_REGISTRY_ID",
		"VITE_KEEPER_REGISTRY_ID",
		"TAKT_BOUNTY_VAULT_ID",
		"VITE_BOUNTY_VAULT_ID",
		"TAKT_JOB_ENGINE_ID",
		"VITE_JOB_ENGINE_ID",
	}
	for _, k := range keys {
		t.Setenv(k, "")
		_ = os.Unsetenv(k)
	}
}

func TestLoadConfig_DefaultsAndFallbacks(t *testing.T) {
	clearKeeperEnv(t)
	t.Setenv("KEEPER_SECRET_KEY", "S_FALLBACK_SECRET")
	t.Setenv("SOROBAN_RPC_URL", "https://fallback-rpc.stellar.org")
	t.Setenv("KEEPER_POLL_INTERVAL_SECONDS", "15")
	t.Setenv("KEEPER_HEALTH_PORT", "9090")
	t.Setenv("VITE_KEEPER_REGISTRY_ID", "REG_FALLBACK")
	t.Setenv("VITE_BOUNTY_VAULT_ID", "VAULT_FALLBACK")
	t.Setenv("VITE_JOB_ENGINE_ID", "ENGINE_FALLBACK")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.KeeperSecret != "S_FALLBACK_SECRET" {
		t.Errorf("expected KeeperSecret S_FALLBACK_SECRET, got %q", cfg.KeeperSecret)
	}
	if cfg.RPCURL != "https://fallback-rpc.stellar.org" {
		t.Errorf("expected RPCURL https://fallback-rpc.stellar.org, got %q", cfg.RPCURL)
	}
	if cfg.PollIntervalSeconds != 15 {
		t.Errorf("expected PollIntervalSeconds 15, got %d", cfg.PollIntervalSeconds)
	}
	if cfg.APIPort != 9090 {
		t.Errorf("expected APIPort 9090, got %d", cfg.APIPort)
	}
	if cfg.KeeperRegistryId != "REG_FALLBACK" {
		t.Errorf("expected KeeperRegistryId REG_FALLBACK, got %q", cfg.KeeperRegistryId)
	}
	if cfg.BountyVaultId != "VAULT_FALLBACK" {
		t.Errorf("expected BountyVaultId VAULT_FALLBACK, got %q", cfg.BountyVaultId)
	}
	if cfg.JobEngineId != "ENGINE_FALLBACK" {
		t.Errorf("expected JobEngineId ENGINE_FALLBACK, got %q", cfg.JobEngineId)
	}
}

func TestLoadConfig_BuiltInDefaults(t *testing.T) {
	clearKeeperEnv(t)
	t.Setenv("TAKT_KEEPER_SECRET", "S_PRIMARY_SECRET")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.RPCURL != "https://soroban-testnet.stellar.org" {
		t.Errorf("expected default RPCURL, got %q", cfg.RPCURL)
	}
	if cfg.PollIntervalSeconds != 10 {
		t.Errorf("expected default PollIntervalSeconds 10, got %d", cfg.PollIntervalSeconds)
	}
	if cfg.APIPort != 8080 {
		t.Errorf("expected default APIPort 8080, got %d", cfg.APIPort)
	}
	if cfg.KeeperRegistryId == "" || cfg.BountyVaultId == "" || cfg.JobEngineId == "" {
		t.Errorf("expected built-in contract IDs to be populated")
	}
}

func TestLoadConfig_TaktEnvPriority(t *testing.T) {
	clearKeeperEnv(t)
	t.Setenv("TAKT_RPC_URL", "https://takt-primary-rpc.stellar.org")
	t.Setenv("SOROBAN_RPC_URL", "https://fallback-rpc.stellar.org")
	t.Setenv("TAKT_KEEPER_SECRET", "S_TAKT_PRIMARY")
	t.Setenv("KEEPER_SECRET_KEY", "S_KEEPER_FALLBACK")
	t.Setenv("TAKT_POLL_INTERVAL_SECONDS", "25")
	t.Setenv("KEEPER_POLL_INTERVAL_SECONDS", "15")
	t.Setenv("TAKT_API_PORT", "8888")
	t.Setenv("KEEPER_HEALTH_PORT", "9090")
	t.Setenv("TAKT_KEEPER_REGISTRY_ID", "REG_TAKT")
	t.Setenv("VITE_KEEPER_REGISTRY_ID", "REG_VITE")
	t.Setenv("TAKT_BOUNTY_VAULT_ID", "VAULT_TAKT")
	t.Setenv("VITE_BOUNTY_VAULT_ID", "VAULT_VITE")
	t.Setenv("TAKT_JOB_ENGINE_ID", "ENGINE_TAKT")
	t.Setenv("VITE_JOB_ENGINE_ID", "ENGINE_VITE")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.RPCURL != "https://takt-primary-rpc.stellar.org" {
		t.Errorf("expected TAKT_RPC_URL priority, got %q", cfg.RPCURL)
	}
	if cfg.KeeperSecret != "S_TAKT_PRIMARY" {
		t.Errorf("expected TAKT_KEEPER_SECRET priority, got %q", cfg.KeeperSecret)
	}
	if cfg.PollIntervalSeconds != 25 {
		t.Errorf("expected TAKT_POLL_INTERVAL_SECONDS priority (25), got %d", cfg.PollIntervalSeconds)
	}
	if cfg.APIPort != 8888 {
		t.Errorf("expected TAKT_API_PORT priority (8888), got %d", cfg.APIPort)
	}
	if cfg.KeeperRegistryId != "REG_TAKT" {
		t.Errorf("expected TAKT_KEEPER_REGISTRY_ID priority, got %q", cfg.KeeperRegistryId)
	}
	if cfg.BountyVaultId != "VAULT_TAKT" {
		t.Errorf("expected TAKT_BOUNTY_VAULT_ID priority, got %q", cfg.BountyVaultId)
	}
	if cfg.JobEngineId != "ENGINE_TAKT" {
		t.Errorf("expected TAKT_JOB_ENGINE_ID priority, got %q", cfg.JobEngineId)
	}
}

func TestLoadConfig_ValidationErrors(t *testing.T) {
	t.Run("missing keeper secret", func(t *testing.T) {
		clearKeeperEnv(t)
		if _, err := LoadConfig(); err == nil {
			t.Fatal("expected error when keeper secret is missing")
		}
	})

	t.Run("invalid TAKT_POLL_INTERVAL_SECONDS", func(t *testing.T) {
		clearKeeperEnv(t)
		t.Setenv("TAKT_KEEPER_SECRET", "S_SECRET")
		t.Setenv("TAKT_POLL_INTERVAL_SECONDS", "not-an-int")
		if _, err := LoadConfig(); err == nil {
			t.Fatal("expected error for invalid TAKT_POLL_INTERVAL_SECONDS")
		}
	})

	t.Run("invalid KEEPER_POLL_INTERVAL_SECONDS", func(t *testing.T) {
		clearKeeperEnv(t)
		t.Setenv("TAKT_KEEPER_SECRET", "S_SECRET")
		t.Setenv("KEEPER_POLL_INTERVAL_SECONDS", "bad")
		if _, err := LoadConfig(); err == nil {
			t.Fatal("expected error for invalid KEEPER_POLL_INTERVAL_SECONDS")
		}
	})

	t.Run("invalid TAKT_API_PORT", func(t *testing.T) {
		clearKeeperEnv(t)
		t.Setenv("TAKT_KEEPER_SECRET", "S_SECRET")
		t.Setenv("TAKT_API_PORT", "invalid-port")
		if _, err := LoadConfig(); err == nil {
			t.Fatal("expected error for invalid TAKT_API_PORT")
		}
	})

	t.Run("invalid KEEPER_HEALTH_PORT", func(t *testing.T) {
		clearKeeperEnv(t)
		t.Setenv("TAKT_KEEPER_SECRET", "S_SECRET")
		t.Setenv("KEEPER_HEALTH_PORT", "invalid-port")
		if _, err := LoadConfig(); err == nil {
			t.Fatal("expected error for invalid KEEPER_HEALTH_PORT")
		}
	})
}
