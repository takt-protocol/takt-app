export type StellarNetworkName = "testnet" | "mainnet" | "standalone";

export interface TaktNetworkConfig {
  network: StellarNetworkName;
  rpcUrl: string;
  networkPassphrase: string;
  keeperRegistryId: string;
  bountyVaultId: string;
  jobEngineId: string;
  tokenAddress: string;
}

export type KeeperStatus = "Active" | "Unbonding" | "Slashed";

export interface KeeperInfo {
  address: string;
  stakedAmount: bigint;
  status: KeeperStatus;
  registeredAt: number;
  unbondUnlockTime: number;
  totalExecutions: number;
  slashes: number;
}

export interface VaultConfig {
  admin: string;
  token: string;
  feeBps: number;
  treasury: string;
  jobEngine: string | null;
}

export type JobStatus = "Active" | "Paused" | "Cancelled" | "Completed";

export interface Job {
  id: number;
  owner: string;
  targetContract: string;
  targetFn: string;
  targetArgsXdr: string[];
  intervalSeconds: number;
  lastExecutedAt: number;
  bountyPerRun: bigint;
  maxRuns: number;
  completedRuns: number;
  status: JobStatus;
  createdAt: number;
}

export interface ExecutionReceipt {
  jobId: number;
  keeper: string;
  executedAt: number;
  runNumber: number;
  keeperReward: bigint;
  protocolFee: bigint;
}

export interface CreateJobParams {
  owner: string;
  targetContract: string;
  targetFn: string;
  targetArgsXdr?: string[];
  intervalSeconds: number;
  bountyPerRun: bigint;
  maxRuns: number;
  initialFunding: bigint;
}

export const DEFAULT_TESTNET_CONFIG: TaktNetworkConfig = {
  network: "testnet",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  keeperRegistryId: "CDSBDXYELFFHM7XMG4D4BXEVETOHQDWPQOTQLPRHGTTVW7DTNODHIIZN",
  bountyVaultId: "CDDIJAZCXR7TWSTI4B2FSE7MCXFKH2JVOBT4WELSSJLZHV5XQ4PKHEGO",
  jobEngineId: "CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT",
  tokenAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
};

export interface RpcHealthResponse {
  status: "healthy" | string;
  latestLedger?: number;
  latestLedgerCloseTime?: string;
  oldestLedger?: number;
  ledgerRetentionWindow?: number;
}

