import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_TESTNET_CONFIG,
  Job,
  KeeperInfo,
  TaktClient,
} from "@takt-protocol/sdk";
import { DashboardStats, ViewTab } from "./types.js";
import { Navbar } from "./components/Navbar.js";
import { StatsHeader } from "./components/StatsHeader.js";
import { JobsView } from "./components/JobsView.js";
import { VaultView } from "./components/VaultView.js";
import { KeepersView } from "./components/KeepersView.js";
import { DeployView } from "./components/DeployView.js";

// Sample jobs data for demo dashboard rendering; not live on-chain state
const INITIAL_JOBS: Job[] = [
  {
    id: 1,
    owner: "GBKGRYZZEELD6POCG5E3MNMA3CT7OKF45CUX3FUDSJH6NJXAMTPXIYRS",
    targetContract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    targetFn: "harvest_yield",
    targetArgsXdr: [],
    intervalSeconds: 300,
    lastExecutedAt: 1730200000,
    bountyPerRun: 25_000_000n,
    maxRuns: 100,
    completedRuns: 14,
    status: "Active",
    createdAt: 1730190000,
  },
  {
    id: 2,
    owner: "GBKGRYZZEELD6POCG5E3MNMA3CT7OKF45CUX3FUDSJH6NJXAMTPXIYRS",
    targetContract: "CDSBDXYELFFHM7XMG4D4BXEVETOHQDWPQOTQLPRHGTTVW7DTNODHIIZN",
    targetFn: "get_total_keepers",
    targetArgsXdr: [],
    intervalSeconds: 60,
    lastExecutedAt: 1730200500,
    bountyPerRun: 10_000_000n,
    maxRuns: 0,
    completedRuns: 42,
    status: "Active",
    createdAt: 1730180000,
  },
];

// Sample keepers data for demo dashboard rendering; not live on-chain state
const INITIAL_KEEPERS: KeeperInfo[] = [
  {
    address: "GBKGRYZZEELD6POCG5E3MNMA3CT7OKF45CUX3FUDSJH6NJXAMTPXIYRS",
    stakedAmount: 2_500_000_000n,
    status: "Active",
    registeredAt: 1730100000,
    unbondUnlockTime: 0,
    totalExecutions: 56,
    slashes: 0,
  },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ViewTab>("jobs");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [jobs] = useState<Job[]>(INITIAL_JOBS);
  const [keepers] = useState<KeeperInfo[]>(INITIAL_KEEPERS);
  const [userBalance] = useState<bigint>(450_000_000n);
  const [rpcHealthy, setRpcHealthy] = useState<boolean | null>(null);
  const [latestLedger, setLatestLedger] = useState<number | null>(null);
  const [protocolVersion, setProtocolVersion] = useState<number | null>(null);

  const client = useMemo(
    () =>
      new TaktClient({
        ...DEFAULT_TESTNET_CONFIG,
        keeperRegistryId:
          import.meta.env.VITE_KEEPER_REGISTRY_ID ||
          DEFAULT_TESTNET_CONFIG.keeperRegistryId,
        bountyVaultId:
          import.meta.env.VITE_BOUNTY_VAULT_ID ||
          DEFAULT_TESTNET_CONFIG.bountyVaultId,
        jobEngineId:
          import.meta.env.VITE_JOB_ENGINE_ID ||
          DEFAULT_TESTNET_CONFIG.jobEngineId,
        tokenAddress:
          import.meta.env.VITE_TOKEN_ADDRESS ||
          DEFAULT_TESTNET_CONFIG.tokenAddress,
      }),
    [],
  );

  const fetchRpcState = useCallback(async () => {
    try {
      const [health, ledger] = await Promise.all([
        client.getHealth(),
        client.getLatestLedger(),
      ]);
      const healthy = health.status === "healthy";
      setRpcHealthy(healthy);
      setLatestLedger(ledger.sequence ?? health.latestLedger ?? null);
      setProtocolVersion(ledger.protocolVersion ?? null);
    } catch {
      setRpcHealthy(false);
    }
  }, [client]);

  useEffect(() => {
    void fetchRpcState();
  }, [fetchRpcState]);

  const stats: DashboardStats = useMemo(
    () => ({
      activeJobsCount: jobs.filter((j) => j.status === "Active").length,
      totalEscrowStroops: 1_850_000_000n,
      activeKeepersCount: keepers.filter((k) => k.status === "Active").length,
      protocolFeesStroops: 92_500_000n,
    }),
    [jobs, keepers],
  );

  const handleConnectWallet = () => {
    setWalletAddress(
      "GBKGRYZZEELD6POCG5E3MNMA3CT7OKF45CUX3FUDSJH6NJXAMTPXIYRS",
    );
  };

  const handleRefresh = () => {
    void fetchRpcState();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs sm:text-sm text-amber-300 font-medium">
        {rpcHealthy === false
          ? "RPC Offline / Simulated — displaying local fallback state."
          : "Demo mode: wallet signing and transaction submission are not implemented. Data marked 'sample' is not live."}
      </div>
      <Navbar
        activeTab={activeTab}
        latestLedger={latestLedger}
        networkName={client.config.network}
        onConnectWallet={handleConnectWallet}
        rpcHealthy={rpcHealthy}
        setActiveTab={setActiveTab}
        walletAddress={walletAddress}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StatsHeader stats={stats} />

        {activeTab === "jobs" && (
          <JobsView
            client={client}
            jobs={jobs}
            onRefresh={handleRefresh}
            walletAddress={walletAddress}
          />
        )}

        {activeTab === "vault" && (
          <VaultView
            client={client}
            onRefresh={handleRefresh}
            userBalance={userBalance}
            walletAddress={walletAddress}
          />
        )}

        {activeTab === "keepers" && (
          <KeepersView
            client={client}
            keepers={keepers}
            onRefresh={handleRefresh}
            walletAddress={walletAddress}
          />
        )}

        {activeTab === "deploy" && (
          <DeployView
            client={client}
            latestLedger={latestLedger}
            onRefreshRpc={handleRefresh}
            protocolVersion={protocolVersion}
            rpcHealthy={rpcHealthy}
          />
        )}
      </main>
    </div>
  );
};

export default App;
