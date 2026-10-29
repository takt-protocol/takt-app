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
