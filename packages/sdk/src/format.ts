import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import {
  Job,
  JobStatus,
  KeeperInfo,
  KeeperStatus,
  VaultConfig,
} from "./types.js";

export const STROOPS_PER_TOKEN = 10_000_000n; // 7 decimals on Stellar
export const BPS_DENOMINATOR = 10_000n;

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
  const formatted =
    trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : `${whole}`;
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

function resolveScVal(input: string | xdr.ScVal): xdr.ScVal {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("XDR input string must not be empty");
    }
    return xdr.ScVal.fromXDR(trimmed, "base64");
  }
  return input;
}

function scValMapToRecord(scVal: xdr.ScVal): Map<string, xdr.ScVal> {
  if (scVal.switch().name !== "scvMap") {
    throw new Error(`Expected scvMap, received ${scVal.switch().name}`);
  }
  const entries = scVal.map() ?? [];
  const out = new Map<string, xdr.ScVal>();
  for (const entry of entries) {
    const kVal = entry.key();
    let key: string;
    if (kVal.switch().name === "scvSymbol") {
      key = kVal.sym().toString();
    } else if (kVal.switch().name === "scvString") {
      key = kVal.str().toString();
    } else {
      key = String(scValToNative(kVal));
    }
    out.set(key, entry.val());
  }
  return out;
}

function getField(
  map: Map<string, xdr.ScVal>,
  ...keys: string[]
): xdr.ScVal | undefined {
  for (const k of keys) {
    if (map.has(k)) {
      return map.get(k);
    }
  }
  return undefined;
}

function requireField(map: Map<string, xdr.ScVal>, ...keys: string[]): xdr.ScVal {
  const found = getField(map, ...keys);
  if (!found) {
    throw new Error(`Missing required ScMap field: ${keys[0]}`);
  }
  return found;
}

function decodeAddress(val: xdr.ScVal): string {
  const sw = val.switch().name;
  if (sw === "scvAddress") {
    return Address.fromScVal(val).toString();
  }
  if (sw === "scvString") {
    return val.str().toString();
  }
  if (sw === "scvSymbol") {
    return val.sym().toString();
  }
  return String(scValToNative(val));
}

function decodeOptionalAddress(val: xdr.ScVal | undefined): string | null {
  if (!val) {
    return null;
  }
  const sw = val.switch().name;
  if (sw === "scvVoid") {
    return null;
  }
  if (sw === "scvVec") {
    const vec = val.vec() ?? [];
    if (vec.length === 0) {
      return null;
    }
    const first = vec[0];
    if (
      first.switch().name === "scvSymbol" &&
      first.sym().toString() === "None"
    ) {
      return null;
    }
    if (
      first.switch().name === "scvSymbol" &&
      first.sym().toString() === "Some" &&
      vec.length > 1
    ) {
      return decodeAddress(vec[1]);
    }
  }
  return decodeAddress(val);
}

function decodeStringOrSymbol(val: xdr.ScVal): string {
  const sw = val.switch().name;
  if (sw === "scvSymbol") {
    return val.sym().toString();
  }
  if (sw === "scvString") {
    return val.str().toString();
  }
  if (sw === "scvVec") {
    const vec = val.vec() ?? [];
    if (vec.length > 0) {
      return decodeStringOrSymbol(vec[0]);
    }
  }
  return String(scValToNative(val));
}

function decodeBigInt(val: xdr.ScVal): bigint {
  const sw = val.switch().name;
  if (sw === "scvI128") {
    const parts = val.i128();
    const hi = BigInt(parts.hi().toString());
    const lo = BigInt.asUintN(64, BigInt(parts.lo().toString()));
    return (hi << 64n) | lo;
  }
  if (sw === "scvU128") {
    const parts = val.u128();
    const hi = BigInt.asUintN(64, BigInt(parts.hi().toString()));
    const lo = BigInt.asUintN(64, BigInt(parts.lo().toString()));
    return (hi << 64n) | lo;
  }
  if (sw === "scvI64") {
    return BigInt(val.i64().toString());
  }
  if (sw === "scvU64") {
    return BigInt(val.u64().toString());
  }
  if (sw === "scvI32") {
    return BigInt(val.i32());
  }
  if (sw === "scvU32") {
    return BigInt(val.u32());
  }
  const native = scValToNative(val);
  return BigInt(native);
}

function decodeNumber(val: xdr.ScVal): number {
  const sw = val.switch().name;
  if (sw === "scvU32") {
    return val.u32();
  }
  if (sw === "scvI32") {
    return val.i32();
  }
  const asBigInt = decodeBigInt(val);
  if (
    asBigInt > BigInt(Number.MAX_SAFE_INTEGER) ||
    asBigInt < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new RangeError(
      `Integer value ${asBigInt.toString()} exceeds IEEE-754 safe integer range`,
    );
  }
  return Number(asBigInt);
}

export function parseJobScVal(input: string | xdr.ScVal): Job {
  const scVal = resolveScVal(input);
  const map = scValMapToRecord(scVal);

  const rawArgsVal = getField(map, "target_args", "target_args_xdr", "targetArgsXdr");
  const targetArgsXdr: string[] = [];
  if (rawArgsVal && rawArgsVal.switch().name === "scvVec") {
    for (const item of rawArgsVal.vec() ?? []) {
      if (item.switch().name === "scvString") {
        const strVal = item.str().toString();
        try {
          xdr.ScVal.fromXDR(strVal, "base64");
          targetArgsXdr.push(strVal);
          continue;
        } catch {
          // Not pre-encoded XDR base64; serialize the ScVal itself
        }
      }
      targetArgsXdr.push(item.toXDR("base64"));
    }
  }

  const statusStr = decodeStringOrSymbol(requireField(map, "status")) as JobStatus;
  if (
    statusStr !== "Active" &&
    statusStr !== "Paused" &&
    statusStr !== "Cancelled" &&
    statusStr !== "Completed"
  ) {
    throw new Error(`Invalid JobStatus in ScVal: "${statusStr}"`);
  }

  return {
    id: decodeNumber(requireField(map, "id")),
    owner: decodeAddress(requireField(map, "owner")),
    targetContract: decodeAddress(
      requireField(map, "target_contract", "targetContract"),
    ),
    targetFn: decodeStringOrSymbol(requireField(map, "target_fn", "targetFn")),
    targetArgsXdr,
    intervalSeconds: decodeNumber(
      requireField(map, "interval_seconds", "intervalSeconds"),
    ),
    lastExecutedAt: decodeNumber(
      requireField(map, "last_executed_at", "lastExecutedAt"),
    ),
    bountyPerRun: decodeBigInt(
      requireField(map, "bounty_per_run", "bountyPerRun"),
    ),
    maxRuns: decodeNumber(requireField(map, "max_runs", "maxRuns")),
    completedRuns: decodeNumber(
      requireField(map, "completed_runs", "completedRuns"),
    ),
    status: statusStr,
    createdAt: decodeNumber(requireField(map, "created_at", "createdAt")),
  };
}

export function parseKeeperInfoScVal(input: string | xdr.ScVal): KeeperInfo {
  const scVal = resolveScVal(input);
  const map = scValMapToRecord(scVal);

  const statusStr = decodeStringOrSymbol(
    requireField(map, "status"),
  ) as KeeperStatus;
  if (
    statusStr !== "Active" &&
    statusStr !== "Unbonding" &&
    statusStr !== "Slashed"
  ) {
    throw new Error(`Invalid KeeperStatus in ScVal: "${statusStr}"`);
  }

  return {
    address: decodeAddress(requireField(map, "address")),
    stakedAmount: decodeBigInt(
      requireField(map, "staked_amount", "stakedAmount"),
    ),
    status: statusStr,
    registeredAt: decodeNumber(
      requireField(map, "registered_at", "registeredAt"),
    ),
    unbondUnlockTime: decodeNumber(
      requireField(map, "unbond_unlock_time", "unbondUnlockTime"),
    ),
    totalExecutions: decodeNumber(
      requireField(map, "total_executions", "totalExecutions"),
    ),
    slashes: decodeNumber(requireField(map, "slashes")),
  };
}

export function parseVaultConfigScVal(input: string | xdr.ScVal): VaultConfig {
  const scVal = resolveScVal(input);
  const map = scValMapToRecord(scVal);

  return {
    admin: decodeAddress(requireField(map, "admin")),
    token: decodeAddress(requireField(map, "token")),
    feeBps: decodeNumber(requireField(map, "fee_bps", "feeBps")),
    treasury: decodeAddress(requireField(map, "treasury")),
    jobEngine: decodeOptionalAddress(
      getField(map, "job_engine", "jobEngine"),
    ),
  };
}
