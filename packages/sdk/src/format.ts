import { StrKey, scValToNative, xdr } from "@stellar/stellar-sdk";
import {
  Job,
  JobStatus,
  KeeperInfo,
  KeeperStatus,
  VaultConfig,
} from "./types.js";

export const STROOPS_PER_TOKEN = 10_000_000n; // 7 decimals on Stellar
export const BPS_DENOMINATOR = 10_000n;

export function isValidPublicKey(address: string): boolean {
  if (typeof address !== "string") {
    return false;
  }
  return StrKey.isValidEd25519PublicKey(address);
}

export function isValidContractId(address: string): boolean {
  if (typeof address !== "string") {
    return false;
  }
  return StrKey.isValidContract(address);
}

export function toStroops(amount: string | number): bigint {
  const normalized = String(amount).trim();
  if (!/^\d+(\.\d{1,7})?$/.test(normalized)) {
    throw new Error(`Invalid token amount format: "${amount}"`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  const paddedFraction = fraction.padEnd(7, "0");
  return BigInt(whole) * STROOPS_PER_TOKEN + BigInt(paddedFraction);
}

export function fromStroops(stroops: bigint, maxDecimals = 2): string {
  const isNegative = stroops < 0n;
  const abs = isNegative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_TOKEN;
  const fraction = (abs % STROOPS_PER_TOKEN).toString().padStart(7, "0");
  const trimmedFraction = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  const formatted = trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : `${whole}`;
  return isNegative ? `-${formatted}` : formatted;
}

export function calculateBountySplit(
  bountyAmount: bigint,
  feeBps: number,
): { keeperReward: bigint; protocolFee: bigint } {
  if (bountyAmount <= 0n) {
    throw new Error("Bounty amount must be greater than zero.");
  }
  if (feeBps < 0 || feeBps > 1_000) {
    throw new Error("Protocol fee basis points must be between 0 and 1000.");
  }
  const protocolFee = (bountyAmount * BigInt(feeBps)) / BPS_DENOMINATOR;
  const keeperReward = bountyAmount - protocolFee;
  return { keeperReward, protocolFee };
}

export function computeNextExecutionTime(
  lastExecutedAt: number,
  intervalSeconds: number,
): number {
  if (lastExecutedAt <= 0) {
    return 0;
  }
  return lastExecutedAt + intervalSeconds;
}

export function isJobReadyForExecution(
  status: string,
  lastExecutedAt: number,
  intervalSeconds: number,
  maxRuns: number,
  completedRuns: number,
  escrowBalance: bigint,
  bountyPerRun: bigint,
  nowSeconds: number,
): boolean {
  if (status !== "Active") {
    return false;
  }
  if (maxRuns > 0 && completedRuns >= maxRuns) {
    return false;
  }
  if (escrowBalance < bountyPerRun) {
    return false;
  }
  if (lastExecutedAt > 0 && nowSeconds < lastExecutedAt + intervalSeconds) {
    return false;
  }
  return true;
}

export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) {
    return address;
  }
  return `${address.slice(0, chars + 1)}...${address.slice(-chars)}`;
}

// ============================================================================
// XDR ScVal Typed Parsers (Issue #10)
// ============================================================================

function normalizeScVal(input: xdr.ScVal | string): xdr.ScVal {
  if (typeof input === "string") {
    return xdr.ScVal.fromXDR(input.trim(), "base64");
  }
  return input;
}

function stringifyAddress(val: unknown, fieldName: string, required = true): string | null {
  if (val === null || val === undefined) {
    if (required) {
      throw new Error(`Missing required address field: ${fieldName}`);
    }
    return null;
  }
  const addrStr =
    typeof val === "object" && typeof (val as { toString: () => string }).toString === "function"
      ? (val as { toString: () => string }).toString()
      : String(val);

  if (!isValidPublicKey(addrStr) && !isValidContractId(addrStr)) {
    throw new Error(`Invalid ${fieldName} address format in ScVal`);
  }
  return addrStr;
}

function safeU64ToNumber(val: unknown, fieldName: string): number {
  if (val === undefined || val === null) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  let big: bigint;
  try {
    big = BigInt(val as string | number | bigint);
  } catch {
    throw new Error(`Cannot convert field ${fieldName} to integer`);
  }
  if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Precision loss: field ${fieldName} (${big.toString()}) exceeds Number.MAX_SAFE_INTEGER`);
  }
  if (big < 0n) {
    throw new Error(`Invalid negative value for field ${fieldName}: ${big.toString()}`);
  }
  return Number(big);
}

function safeBigInt(val: unknown, fieldName: string): bigint {
  if (val === undefined || val === null) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  try {
    return BigInt(val as string | number | bigint);
  } catch {
    throw new Error(`Cannot convert field ${fieldName} to BigInt`);
  }
}

export function parseKeeperStatus(status: unknown): KeeperStatus {
  if (Array.isArray(status) && status.length > 0) {
    return parseKeeperStatus(status[0]);
  }
  if (typeof status === "string") {
    const s = status.toLowerCase();
    if (s === "active") return "Active";
    if (s === "unbonding") return "Unbonding";
    if (s === "slashed") return "Slashed";
  }
  if (typeof status === "object" && status !== null) {
    const name = (status as { name?: string }).name || Object.keys(status)[0];
    if (name) return parseKeeperStatus(name);
  }
  if (typeof status === "number") {
    if (status === 0) return "Active";
    if (status === 1) return "Unbonding";
    if (status === 2) return "Slashed";
  }
  throw new Error(`Invalid or unrecognized KeeperStatus value: ${JSON.stringify(status)}`);
}

export function parseJobStatus(status: unknown): JobStatus {
  if (Array.isArray(status) && status.length > 0) {
    return parseJobStatus(status[0]);
  }
  if (typeof status === "string") {
    const s = status.toLowerCase();
    if (s === "active") return "Active";
    if (s === "paused") return "Paused";
    if (s === "cancelled" || s === "canceled") return "Cancelled";
    if (s === "completed") return "Completed";
  }
  if (typeof status === "object" && status !== null) {
    const name = (status as { name?: string }).name || Object.keys(status)[0];
    if (name) return parseJobStatus(name);
  }
  if (typeof status === "number") {
    if (status === 0) return "Active";
    if (status === 1) return "Paused";
    if (status === 2) return "Cancelled";
    if (status === 3) return "Completed";
  }
  throw new Error(`Invalid or unrecognized JobStatus value: ${JSON.stringify(status)}`);
}

function extractTargetArgsXdr(scVal: xdr.ScVal, raw: Record<string, unknown>): string[] {
  // If scVal is a map, extract individual ScVal items from the entry
  if (scVal.switch().name === "scvMap") {
    const entries = scVal.map() ?? [];
    for (const entry of entries) {
      let keyName = "";
      try {
        keyName = String(scValToNative(entry.key()));
      } catch {
        const sw = entry.key().switch().name;
        if (sw === "scvSymbol") keyName = entry.key().sym().toString();
        else if (sw === "scvString") keyName = entry.key().str().toString();
      }
      if (keyName === "target_args" || keyName === "target_args_xdr" || keyName === "targetArgsXdr") {
        const val = entry.val();
        if (val.switch().name === "scvVec") {
          return (val.vec() ?? []).map((v) => {
            const sw = v.switch().name;
            if (sw === "scvString") {
              return v.str().toString();
            }
            if (sw === "scvSymbol") {
              return v.sym().toString();
            }
            return v.toXDR("base64");
          });
        }
      }
    }
  }

  const argsRaw = raw.target_args_xdr ?? raw.target_args ?? raw.targetArgsXdr ?? [];
  if (Array.isArray(argsRaw)) {
    return argsRaw.map((a) => String(a));
  }
  return [];
}

export function parseKeeperInfoScVal(input: xdr.ScVal | string): KeeperInfo {
  const scVal = normalizeScVal(input);
  if (scVal.switch().name !== "scvMap") {
    throw new Error("Invalid KeeperInfo ScVal: expected struct/map representation (scvMap)");
  }
  const raw = scValToNative(scVal) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid KeeperInfo ScVal: expected valid object mapping");
  }

  const getField = (snake: string, camel: string): unknown =>
    raw[snake] !== undefined ? raw[snake] : raw[camel];

  const address = stringifyAddress(getField("address", "address"), "address", true)!;
  const stakedAmount = safeBigInt(getField("staked_amount", "stakedAmount"), "stakedAmount");
  const status = parseKeeperStatus(getField("status", "status"));
  const registeredAt = safeU64ToNumber(getField("registered_at", "registeredAt"), "registeredAt");
  const unbondUnlockTime = safeU64ToNumber(getField("unbond_unlock_time", "unbondUnlockTime"), "unbondUnlockTime");
  const totalExecutions = safeU64ToNumber(getField("total_executions", "totalExecutions"), "totalExecutions");
  const slashes = safeU64ToNumber(getField("slashes", "slashes"), "slashes");

  return {
    address,
    stakedAmount,
    status,
    registeredAt,
    unbondUnlockTime,
    totalExecutions,
    slashes,
  };
}

export function parseVaultConfigScVal(input: xdr.ScVal | string): VaultConfig {
  const scVal = normalizeScVal(input);
  if (scVal.switch().name !== "scvMap") {
    throw new Error("Invalid VaultConfig ScVal: expected struct/map representation (scvMap)");
  }
  const raw = scValToNative(scVal) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid VaultConfig ScVal: expected valid object mapping");
  }

  const getField = (snake: string, camel: string): unknown =>
    raw[snake] !== undefined ? raw[snake] : raw[camel];

  const admin = stringifyAddress(getField("admin", "admin"), "admin", true)!;
  const token = stringifyAddress(getField("token", "token"), "token", true)!;
  const feeBps = safeU64ToNumber(getField("fee_bps", "feeBps"), "feeBps");
  const treasury = stringifyAddress(getField("treasury", "treasury"), "treasury", true)!;
  const jobEngine = stringifyAddress(getField("job_engine", "jobEngine"), "jobEngine", false);

  return {
    admin,
    token,
    feeBps,
    treasury,
    jobEngine,
  };
}

export function parseJobScVal(input: xdr.ScVal | string): Job {
  const scVal = normalizeScVal(input);
  if (scVal.switch().name !== "scvMap") {
    throw new Error("Invalid Job ScVal: expected struct/map representation (scvMap)");
  }
  const raw = scValToNative(scVal) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid Job ScVal: expected valid object mapping");
  }

  const getField = (snake: string, camel: string): unknown =>
    raw[snake] !== undefined ? raw[snake] : raw[camel];

  const id = safeU64ToNumber(getField("id", "id"), "id");
  const owner = stringifyAddress(getField("owner", "owner"), "owner", true)!;
  const targetContract = stringifyAddress(getField("target_contract", "targetContract"), "targetContract", true)!;
  const targetFnVal = getField("target_fn", "targetFn");
  if (!targetFnVal || typeof targetFnVal !== "string") {
    throw new Error("Missing or invalid required field: targetFn");
  }
  const targetFn = targetFnVal;
  const targetArgsXdr = extractTargetArgsXdr(scVal, raw);
  const intervalSeconds = safeU64ToNumber(getField("interval_seconds", "intervalSeconds"), "intervalSeconds");
  const lastExecutedAt = safeU64ToNumber(getField("last_executed_at", "lastExecutedAt"), "lastExecutedAt");
  const bountyPerRun = safeBigInt(getField("bounty_per_run", "bountyPerRun"), "bountyPerRun");
  const maxRuns = safeU64ToNumber(getField("max_runs", "maxRuns"), "maxRuns");
  const completedRuns = safeU64ToNumber(getField("completed_runs", "completedRuns"), "completedRuns");
  const status = parseJobStatus(getField("status", "status"));
  const createdAt = safeU64ToNumber(getField("created_at", "createdAt"), "createdAt");

  return {
    id,
    owner,
    targetContract,
    targetFn,
    targetArgsXdr,
    intervalSeconds,
    lastExecutedAt,
    bountyPerRun,
    maxRuns,
    completedRuns,
    status,
    createdAt,
  };
}
