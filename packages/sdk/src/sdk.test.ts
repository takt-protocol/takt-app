import { describe, expect, it } from "vitest";
import {
  calculateBountySplit,
  decodeContractError,
  fromStroops,
  isJobReadyForExecution,
  isValidContractId,
  isValidPublicKey,
  parseSorobanErrorString,
  TaktClient,
  toStroops,
} from "./index.js";

describe("@takt-protocol/sdk", () => {
  it("validates Stellar contract IDs and public keys", () => {
    const publicKey = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
    expect(isValidPublicKey(publicKey)).toBe(true);
    expect(isValidContractId(contractId)).toBe(true);
    expect(isValidPublicKey(contractId)).toBe(false);
    expect(isValidContractId(publicKey)).toBe(false);
    expect(isValidPublicKey("GOWNER123")).toBe(false);
    expect(isValidContractId("CTARGET123")).toBe(false);
  });
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
      owner: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      targetContract: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
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

  it("rejects malformed addresses in contract call builders", () => {
    const owner = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    const targetContract = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
    const params = {
      owner,
      targetContract,
      targetFn: "increment",
      intervalSeconds: 60,
      bountyPerRun: 200_000n,
      maxRuns: 3,
      initialFunding: 600_000n,
    };

    expect(() => new TaktClient().buildRegisterKeeperCall("GOWNER123", 1n)).toThrow(
      'Invalid keeper public key: "GOWNER123"',
    );
    expect(() => new TaktClient().buildDepositVaultCall("GOWNER123", 1n)).toThrow(
      'Invalid owner public key: "GOWNER123"',
    );
    expect(() =>
      new TaktClient().buildCreateJobCall({ ...params, targetContract: "CTARGET123" }),
    ).toThrow('Invalid Soroban contract ID: "CTARGET123"');
    expect(() => new TaktClient({ keeperRegistryId: "bad" }).buildRequestUnbondCall(owner)).toThrow(
      'Invalid Soroban contract ID: "bad"',
    );
    expect(() => new TaktClient({ bountyVaultId: "bad" }).buildDepositVaultCall(owner, 1n)).toThrow(
      'Invalid Soroban contract ID: "bad"',
    );
    expect(() => new TaktClient({ jobEngineId: "bad" }).buildPauseJobCall(owner, 1)).toThrow(
      'Invalid Soroban contract ID: "bad"',
    );
  });
});
