export type ViewTab = "jobs" | "vault" | "keepers" | "deploy";

export type WalletMode = "Freighter" | "Demo Mode";

export interface DashboardStats {
  activeJobsCount: number;
  totalEscrowStroops: bigint;
  activeKeepersCount: number;
  protocolFeesStroops: bigint;
}
