export type TaktContractSource = "keeper-registry" | "bounty-vault" | "job-engine";

export const REGISTRY_ERRORS: Record<number, { name: string; message: string }> = {
  1: { name: "AlreadyInitialized", message: "KeeperRegistry is already initialized." },
  2: { name: "NotInitialized", message: "KeeperRegistry has not been initialized yet." },
  3: { name: "InvalidAmount", message: "Provided stake or slash amount must be greater than zero." },
  4: { name: "InsufficientStake", message: "Stake amount is below the protocol minimum stake requirement." },
  5: { name: "KeeperAlreadyRegistered", message: "This keeper address is already registered." },
  6: { name: "KeeperNotFound", message: "Keeper record does not exist in KeeperRegistry." },
  7: { name: "KeeperNotActive", message: "Keeper must be in Active status to perform this operation." },
  8: { name: "KeeperNotUnbonding", message: "Keeper has not requested unbonding." },
  9: { name: "CooldownNotElapsed", message: "Unbonding cooldown period has not elapsed yet." },
  10: { name: "UnauthorizedEngine", message: "Caller is not the authorized JobEngine contract." },
  11: { name: "Overflow", message: "Arithmetic overflow occurred in KeeperRegistry." },
};

export const VAULT_ERRORS: Record<number, { name: string; message: string }> = {
  1: { name: "AlreadyInitialized", message: "BountyVault is already initialized." },
  2: { name: "NotInitialized", message: "BountyVault has not been initialized yet." },
  3: { name: "InvalidAmount", message: "Deposit, withdrawal, or bounty amount must be positive." },
  4: { name: "FeeTooHigh", message: "Protocol fee basis points exceed the 10% (1000 bps) maximum." },
  5: { name: "InsufficientUserBalance", message: "User vault balance is insufficient for this operation." },
  6: { name: "InsufficientJobEscrow", message: "Job escrow balance is insufficient to cover the execution bounty." },
  7: { name: "EngineNotSet", message: "JobEngine address has not been linked to BountyVault." },
  8: { name: "UnauthorizedCaller", message: "Caller is not authorized to invoke this vault method." },
  9: { name: "Overflow", message: "Arithmetic overflow occurred in BountyVault." },
};

export const ENGINE_ERRORS: Record<number, { name: string; message: string }> = {
  1: { name: "AlreadyInitialized", message: "JobEngine is already initialized." },
  2: { name: "NotInitialized", message: "JobEngine has not been initialized yet." },
  3: { name: "InvalidInterval", message: "Execution interval must be at least 5 seconds." },
  4: { name: "InvalidBounty", message: "Bounty per run must be strictly positive." },
  5: { name: "InsufficientInitialFunding", message: "Initial job funding must cover at least one execution run." },
  6: { name: "JobNotFound", message: "Requested job ID does not exist in JobEngine." },
  7: { name: "JobNotActive", message: "Job is not currently in Active status." },
  8: { name: "JobNotPaused", message: "Job must be Paused before it can be resumed." },
  9: { name: "UnauthorizedOwner", message: "Only the job creator can pause, resume, or cancel this job." },
  10: { name: "IntervalNotElapsed", message: "Scheduled interval has not elapsed since the last execution." },
  11: { name: "MaxRunsReached", message: "Job has already completed its maximum configured runs." },
  12: { name: "Overflow", message: "Arithmetic overflow occurred in JobEngine." },
};

export interface DecodedContractError {
  source: TaktContractSource;
  code: number;
  name: string;
  message: string;
}

export function decodeContractError(
  source: TaktContractSource,
  code: number,
): DecodedContractError {
  const table =
    source === "keeper-registry"
      ? REGISTRY_ERRORS
      : source === "bounty-vault"
        ? VAULT_ERRORS
        : ENGINE_ERRORS;

  const entry = table[code];
  if (!entry) {
    return {
      source,
      code,
      name: "UnknownContractError",
      message: `Unrecognized contract error code ${code} from ${source}.`,
    };
  }

  return {
    source,
    code,
    name: entry.name,
    message: entry.message,
  };
}

export function parseSorobanErrorString(
  source: TaktContractSource,
  rawError: string,
): DecodedContractError | null {
  const match = rawError.match(/Error\(Contract,\s*#(\d+)\)/i);
  if (!match) {
    return null;
  }
  const code = Number.parseInt(match[1], 10);
  return decodeContractError(source, code);
}
