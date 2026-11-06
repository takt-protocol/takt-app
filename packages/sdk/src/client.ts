import {
  CreateJobParams,
  DEFAULT_TESTNET_CONFIG,
  TaktNetworkConfig,
} from "./types.js";
import { isValidContractId, isValidPublicKey } from "./format.js";

export interface ContractCallDescriptor {
  contractId: string;
  method: string;
  args: Record<string, unknown>;
}

function requirePublicKey(address: string, field: string): void {
  if (!isValidPublicKey(address)) {
    throw new Error(
      `Invalid ${field}: expected a valid Stellar account ID (G...), got "${address}".`,
    );
  }
}

function requireContractId(address: string, field: string): void {
  if (!isValidContractId(address)) {
    throw new Error(
      `Invalid ${field}: expected a valid Soroban contract ID (C...), got "${address}".`,
    );
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

  public buildRegisterKeeperCall(
    keeper: string,
    stakeAmount: bigint,
  ): ContractCallDescriptor {
    requirePublicKey(keeper, "keeper");
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
    requirePublicKey(keeper, "keeper");
    return {
      contractId: this.config.keeperRegistryId,
      method: "request_unbond",
      args: { keeper },
    };
  }

  public buildWithdrawStakeCall(keeper: string): ContractCallDescriptor {
    requirePublicKey(keeper, "keeper");
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
    requirePublicKey(owner, "owner");
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
    requirePublicKey(owner, "owner");
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
    requirePublicKey(params.owner, "owner");
    requireContractId(params.targetContract, "targetContract");
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
    requirePublicKey(keeper, "keeper");
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
    requirePublicKey(owner, "owner");
    return {
      contractId: this.config.jobEngineId,
      method: "pause_job",
      args: { owner, job_id: jobId },
    };
  }

  public buildResumeJobCall(owner: string, jobId: number): ContractCallDescriptor {
    requirePublicKey(owner, "owner");
    return {
      contractId: this.config.jobEngineId,
      method: "resume_job",
      args: { owner, job_id: jobId },
    };
  }

  public buildCancelJobCall(owner: string, jobId: number): ContractCallDescriptor {
    requirePublicKey(owner, "owner");
    return {
      contractId: this.config.jobEngineId,
      method: "cancel_job",
      args: { owner, job_id: jobId },
    };
  }
}
