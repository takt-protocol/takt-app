import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [rpcHealth, setRpcHealth] = useState<{
    status: string;
    latestLedger?: number;
    latestLedgerCloseTime?: string;
    oldestLedger?: number;
    isSimulated?: boolean;
    isLoading?: boolean;
    lastCheckedAt?: Date | null;
    error?: string | null;
  }>({
    status: "healthy",
    isSimulated: true,
    isLoading: false,
    lastCheckedAt: null,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef<number>(0);

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

  const fetchRpcHealth = useCallback(async () => {
    // Cancel any in-flight request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentSeq = ++requestSeqRef.current;

    setRpcHealth((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const health = await client.getHealth({ signal: controller.signal, timeoutMs: 8000 });
      // Ignore if superseded by a newer request
      if (currentSeq !== requestSeqRef.current) return;

      setRpcHealth({
        status: health.status,
        latestLedger: health.latestLedger,
        latestLedgerCloseTime: health.latestLedgerCloseTime,
        oldestLedger: health.oldestLedger,
        isSimulated: false,
        isLoading: false,
        lastCheckedAt: new Date(),
        error: null,
      });
    } catch (err: unknown) {
      if (currentSeq !== requestSeqRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;

      console.warn("Soroban RPC connection failed, falling back to simulated mode:", err);
      setRpcHealth({
        status: "offline",
        latestLedger: undefined,
        latestLedgerCloseTime: undefined,
        oldestLedger: undefined,
        isSimulated: true,
        isLoading: false,
        lastCheckedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [client]);

  useEffect(() => {
    fetchRpcHealth();
    // Bounded periodic refresh interval (every 30 seconds)
    const intervalId = setInterval(() => {
      fetchRpcHealth();
    }, 30000);

    return () => {
      clearInterval(intervalId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchRpcHealth]);

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
    console.log("Refreshed Takt Protocol state.");
    fetchRpcHealth();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar
        activeTab={activeTab}
        networkName={client.config.network}
        onConnectWallet={handleConnectWallet}
        setActiveTab={setActiveTab}
        walletAddress={walletAddress}
        rpcHealth={rpcHealth}
        onRefreshRpc={fetchRpcHealth}
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
            rpcHealth={rpcHealth}
            onRefreshRpc={fetchRpcHealth}
          />
        )}
      </main>
    </div>
  );
};

export default App;
