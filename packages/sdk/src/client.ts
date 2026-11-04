import {
  CreateJobParams,
  DEFAULT_TESTNET_CONFIG,
  RpcHealthResponse,
  TaktNetworkConfig,
} from "./types.js";

export interface ContractCallDescriptor {
  contractId: string;
  method: string;
  args: Record<string, unknown>;
}

export class TaktClient {
  public readonly config: TaktNetworkConfig;

  constructor(config: Partial<TaktNetworkConfig> = {}) {
    this.config = {
      ...DEFAULT_TESTNET_CONFIG,
      ...config,
    };
  }

  public buildRegisterKeeperCall(
    keeper: string,
    stakeAmount: bigint,
  ): ContractCallDescriptor {
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
    return {
      contractId: this.config.keeperRegistryId,
      method: "request_unbond",
      args: { keeper },
    };
  }

  public buildWithdrawStakeCall(keeper: string): ContractCallDescriptor {
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
    return {
      contractId: this.config.jobEngineId,
      method: "execute_job",
      args: {
        keeper,
        job_id: jobId,
      },
    };
  }

  public buildPauseJobCall(owner: string, jobId: number): ContractCallDescriptor {
    return {
      contractId: this.config.jobEngineId,
      method: "pause_job",
      args: { owner, job_id: jobId },
    };
  }

  public buildResumeJobCall(owner: string, jobId: number): ContractCallDescriptor {
    return {
      contractId: this.config.jobEngineId,
      method: "resume_job",
      args: { owner, job_id: jobId },
    };
  }

  public buildCancelJobCall(owner: string, jobId: number): ContractCallDescriptor {
    return {
      contractId: this.config.jobEngineId,
      method: "cancel_job",
      args: { owner, job_id: jobId },
    };
  }

  public async getHealth(options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<RpcHealthResponse> {
    const { timeoutMs = 8000, signal } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener("abort", onExternalAbort);
    }

    try {
      const response = await fetch(this.config.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getHealth",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`RPC HTTP error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data || typeof data !== "object") {
        throw new Error("Invalid RPC response: expected JSON object");
      }

      if (data.error) {
        throw new Error(data.error.message || `RPC error code ${data.error.code}`);
      }

      if (!data.result || typeof data.result !== "object" || typeof data.result.status !== "string") {
        throw new Error("Malformed RPC result: missing valid status field");
      }

      return data.result as RpcHealthResponse;
    } finally {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }
}
