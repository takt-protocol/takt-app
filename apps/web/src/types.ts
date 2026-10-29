export type ViewTab = "jobs" | "vault" | "keepers" | "deploy";

export interface DashboardStats {
  activeJobsCount: number;
  totalEscrowStroops: bigint;
  activeKeepersCount: number;
  protocolFeesStroops: bigint;
}
