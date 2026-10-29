import { describe, expect, it } from "vitest";
import {
  calculateBountySplit,
  decodeContractError,
  fromStroops,
  isJobReadyForExecution,
  parseSorobanErrorString,
  TaktClient,
  toStroops,
} from "./index.js";

describe("@takt-protocol/sdk", () => {
  it("converts token amounts to and from stroops accurately", () => {
    const stroops = toStroops("125.5");
    expect(stroops).toBe(1_255_000_000n);
    expect(fromStroops(stroops)).toBe("125.5");
  });

  it("computes basis-point fee splits identical to BountyVault", () => {
    const { keeperReward, protocolFee } = calculateBountySplit(200_000n, 500);
    expect(keeperReward).toBe(190_000n);
    expect(protocolFee).toBe(10_000n);
  });

  it("decodes contract error codes and raw Soroban error strings", () => {
    const decoded = decodeContractError("keeper-registry", 9);
    expect(decoded.name).toBe("CooldownNotElapsed");

    const parsed = parseSorobanErrorString(
      "job-engine",
      "HostError: Error(Contract, #10)",
    );
    expect(parsed?.name).toBe("IntervalNotElapsed");
  });

  it("evaluates job execution readiness accurately", () => {
    expect(
      isJobReadyForExecution("Active", 1000, 60, 5, 2, 500_000n, 100_000n, 1060),
    ).toBe(true);
    expect(
      isJobReadyForExecution("Active", 1000, 60, 5, 2, 500_000n, 100_000n, 1030),
    ).toBe(false);
    expect(
      isJobReadyForExecution("Paused", 1000, 60, 5, 2, 500_000n, 100_000n, 1100),
    ).toBe(false);
  });

  it("builds validated contract call descriptors", () => {
    const client = new TaktClient();
    const call = client.buildCreateJobCall({
      owner: "GOWNER123",
      targetContract: "CTARGET123",
      targetFn: "increment",
      intervalSeconds: 60,
      bountyPerRun: 200_000n,
      maxRuns: 3,
      initialFunding: 600_000n,
    });

    expect(call.method).toBe("create_job");
    expect(call.args.interval_seconds).toBe(60);
    expect(call.args.bounty_per_run).toBe("200000");
  });
});
