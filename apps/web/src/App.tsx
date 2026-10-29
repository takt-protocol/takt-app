import React, { useMemo, useState } from "react";
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
    owner: "GB7T7QW7U6J6Z2F3X4V5B6N7M8K9L2P3Q4R5S6T7U8V9W2X3Y4Z5A6B7",
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
    owner: "GB7T7QW7U6J6Z2F3X4V5B6N7M8K9L2P3Q4R5S6T7U8V9W2X3Y4Z5A6B7",
    targetContract: "CCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB",
    targetFn: "rebalance_pool",
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
    address: "GD5K3M2N4P6Q8R9S2T3U4V5W6X7Y8Z9A2B3C4D5E6F7G8H9J2K3L4M5N",
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
      "GB7T7QW7U6J6Z2F3X4V5B6N7M8K9L2P3Q4R5S6T7U8V9W2X3Y4Z5A6B7",
    );
  };

  const handleRefresh = () => {
    console.log("Refreshed Takt Protocol state.");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar
        activeTab={activeTab}
        networkName={client.config.network}
        onConnectWallet={handleConnectWallet}
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

        {activeTab === "deploy" && <DeployView client={client} />}
      </main>
    </div>
  );
};

export default App;
