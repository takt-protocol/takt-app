import {
  CreateJobParams,
  DEFAULT_TESTNET_CONFIG,
  Job,
  KeeperInfo,
  TaktNetworkConfig,
  VaultConfig,
} from "./types.js";
import {
  parseJobScVal,
  parseKeeperInfoScVal,
  parseVaultConfigScVal,
} from "./format.js";

export interface ContractCallDescriptor {
  contractId: string;
  method: string;
  args: Record<string, unknown>;
}

export interface RpcHealthStatus {
  status: "healthy" | "offline";
  latestLedger: number | null;
  oldestLedger?: number | null;
  ledgerRetentionWindow?: number | null;
}

function assertPositiveJobId(jobId: number): void {
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new Error("jobId must be a positive integer");
  }
}

function assertNonEmptyAddress(address: string, label: string): void {
  if (!address || typeof address !== "string" || address.trim().length === 0) {
    throw new Error(`${label} address is required`);
  }
}

export class TaktClient {
  public readonly config: TaktNetworkConfig;

  constructor(config: Partial<TaktNetworkConfig> = {}) {
    this.config = {
      ...DEFAULT_TESTNET_CONFIG,
      ...config,
    };
  }

  public async getHealth(): Promise<RpcHealthStatus> {
    try {
      const healthRes = await fetch(this.config.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getHealth",
        }),
      });
      if (!healthRes.ok) {
        return { status: "offline", latestLedger: null };
      }
      const healthJson = (await healthRes.json()) as {
        result?: {
          status?: string;
          latestLedger?: number;
          oldestLedger?: number;
          ledgerRetentionWindow?: number;
        };
      };
      const result = healthJson.result;
      if (!result || result.status !== "healthy") {
        return { status: "offline", latestLedger: null };
      }

      if (typeof result.latestLedger === "number") {
        return {
          status: "healthy",
          latestLedger: result.latestLedger,
          oldestLedger: result.oldestLedger ?? null,
          ledgerRetentionWindow: result.ledgerRetentionWindow ?? null,
        };
      }

      const ledgerRes = await fetch(this.config.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "getLatestLedger",
        }),
      });
      if (ledgerRes.ok) {
        const ledgerJson = (await ledgerRes.json()) as {
          result?: { sequence?: number };
        };
        return {
          status: "healthy",
          latestLedger: ledgerJson.result?.sequence ?? null,
        };
      }
      return { status: "healthy", latestLedger: null };
    } catch {
      return { status: "offline", latestLedger: null };
    }
  }

  public async simulateReadOnly(transactionXdr: string): Promise<string | null> {
    const res = await fetch(this.config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: { transaction: transactionXdr },
      }),
    });
    if (!res.ok) {
      throw new Error(`Soroban RPC HTTP error ${res.status}`);
    }
    const payload = (await res.json()) as {
      result?: {
        error?: string;
        results?: Array<{ xdr?: string }>;
      };
      error?: { message?: string };
    };
    if (payload.error) {
      throw new Error(payload.error.message || "RPC simulateTransaction error");
    }
    if (payload.result?.error) {
      throw new Error(payload.result.error);
    }
    return payload.result?.results?.[0]?.xdr ?? null;
  }

  public decodeJobResponse(xdrBase64: string): Job {
    return parseJobScVal(xdrBase64);
  }

  public decodeKeeperInfoResponse(xdrBase64: string): KeeperInfo {
    return parseKeeperInfoScVal(xdrBase64);
  }

  public decodeVaultConfigResponse(xdrBase64: string): VaultConfig {
    return parseVaultConfigScVal(xdrBase64);
  }

  public buildRegisterKeeperCall(
    keeper: string,
    stakeAmount: bigint,
  ): ContractCallDescriptor {
    assertNonEmptyAddress(keeper, "keeper");
    if (stakeAmount <= 0n) {
      throw new Error("stakeAmount must be positive");
    }
    return {
      contractId: this.config.keeperRegistryId,
      method: "register_keeper",
      args: {
        keeper,
        stake_amount: stakeAmount.toString(),
      },
    };
  }

  public buildRequestUnbondCall(keeper: string): ContractCallDescriptor {
    assertNonEmptyAddress(keeper, "keeper");
    return {
      contractId: this.config.keeperRegistryId,
      method: "request_unbond",
      args: { keeper },
    };
  }

  public buildWithdrawStakeCall(keeper: string): ContractCallDescriptor {
    assertNonEmptyAddress(keeper, "keeper");
    return {
      contractId: this.config.keeperRegistryId,
      method: "withdraw_stake",
      args: { keeper },
    };
  }

  public buildDepositVaultCall(
    owner: string,
    amount: bigint,
  ): ContractCallDescriptor {
    assertNonEmptyAddress(owner, "owner");
    if (amount <= 0n) {
      throw new Error("deposit amount must be positive");
    }
    return {
      contractId: this.config.bountyVaultId,
      method: "deposit",
      args: {
        owner,
        amount: amount.toString(),
      },
    };
  }

  public buildTopUpJobCall(
    owner: string,
    jobId: number,
    amount: bigint,
  ): ContractCallDescriptor {
    assertNonEmptyAddress(owner, "owner");
    assertPositiveJobId(jobId);
    if (amount <= 0n) {
      throw new Error("top-up amount must be positive");
    }
    return {
      contractId: this.config.bountyVaultId,
      method: "top_up_job",
      args: {
        owner,
        job_id: jobId,
        amount: amount.toString(),
      },
    };
  }

  public buildCreateJobCall(params: CreateJobParams): ContractCallDescriptor {
    assertNonEmptyAddress(params.owner, "owner");
    assertNonEmptyAddress(params.targetContract, "targetContract");
    if (params.intervalSeconds < 5) {
      throw new Error("intervalSeconds must be at least 5 seconds");
    }
    if (params.bountyPerRun <= 0n) {
      throw new Error("bountyPerRun must be positive");
    }
    if (params.initialFunding < params.bountyPerRun) {
      throw new Error("initialFunding must be at least bountyPerRun");
    }
    return {
      contractId: this.config.jobEngineId,
      method: "create_job",
      args: {
        owner: params.owner,
        target_contract: params.targetContract,
        target_fn: params.targetFn,
        target_args: params.targetArgsXdr ?? [],
        interval_seconds: params.intervalSeconds,
        bounty_per_run: params.bountyPerRun.toString(),
        max_runs: params.maxRuns,
        initial_funding: params.initialFunding.toString(),
      },
    };
  }

  public buildExecuteJobCall(
    keeper: string,
    jobId: number,
  ): ContractCallDescriptor {
    assertNonEmptyAddress(keeper, "keeper");
    assertPositiveJobId(jobId);
    return {
      contractId: this.config.jobEngineId,
      method: "execute_job",
      args: {
        keeper,
        job_id: jobId,
      },
    };
  }

  public buildPauseJobCall(
    owner: string,
    jobId: number,
  ): ContractCallDescriptor {
    assertNonEmptyAddress(owner, "owner");
    assertPositiveJobId(jobId);
    return {
      contractId: this.config.jobEngineId,
      method: "pause_job",
      args: { owner, job_id: jobId },
    };
  }

  public buildResumeJobCall(
    owner: string,
    jobId: number,
  ): ContractCallDescriptor {
    assertNonEmptyAddress(owner, "owner");
    assertPositiveJobId(jobId);
    return {
      contractId: this.config.jobEngineId,
      method: "resume_job",
      args: { owner, job_id: jobId },
    };
  }

  public buildCancelJobCall(
    owner: string,
    jobId: number,
  ): ContractCallDescriptor {
    assertNonEmptyAddress(owner, "owner");
    assertPositiveJobId(jobId);
    return {
      contractId: this.config.jobEngineId,
      method: "cancel_job",
      args: { owner, job_id: jobId },
    };
  }
}
