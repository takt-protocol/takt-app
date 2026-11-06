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

// Deterministic, checksum-valid StrKey fixtures (encoded from fixed bytes).
const VALID_KEEPER_ID = "GB2GC23UFVTGS6DUOVZGKLLLMVSXAZLSFVQWGY3POVXHILJTGJRHTCCD";
const VALID_OWNER_ID = "GB2GC23UFVTGS6DUOVZGKLLCN52W45DZFVXXO3TFOIWTGMTYPB4HRM2C";
const VALID_TARGET_CONTRACT = "CB2GC23UFVTGS6DUOVZGKLLUMFZGOZLUFVRW63TUOJQWG5BNGMZHR2RE";
const VALID_VAULT_CONTRACT = "CB2GC23UFVTGS6DUOVZGKLLWMF2WY5BNMNXW45DSMFRXILJTGJRHQ55O";

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

  it("validates Stellar account IDs and Soroban contract IDs", () => {
    expect(isValidPublicKey(VALID_KEEPER_ID)).toBe(true);
    expect(isValidContractId(VALID_TARGET_CONTRACT)).toBe(true);

    // right length/format before checksum, wrong prefix, placeholder junk
    expect(isValidPublicKey("GOWNER123")).toBe(false);
    expect(isValidContractId("CTARGET123")).toBe(false);
    expect(isValidPublicKey(VALID_TARGET_CONTRACT)).toBe(false);
    expect(isValidContractId(VALID_KEEPER_ID)).toBe(false);
    expect(isValidPublicKey("C" + "A".repeat(55))).toBe(false);
    expect(isValidContractId("G" + "A".repeat(55))).toBe(false);
    expect(isValidPublicKey("")).toBe(false);
    expect(isValidContractId("")).toBe(false);
    expect(isValidPublicKey("GB2GC23UFVTGS6DUOVZGKLLLMVSXAZLSFVQWGY3POVXHILJTGJRHXXX")).toBe(false);
  });

  it("rejects malformed addresses in TaktClient call builders", () => {
    const client = new TaktClient();

    expect(() => client.buildRegisterKeeperCall("GOWNER123", 1n)).toThrow(
      /^Invalid keeper: expected a valid Stellar account ID/,
    );
    expect(() => client.buildWithdrawStakeCall("CTARGET123")).toThrow(
      /Invalid keeper/, // contract IDs are not account IDs
    );
    expect(() => client.buildDepositVaultCall("GOWNER123", 1n)).toThrow(
      /Invalid owner: expected a valid Stellar account ID/,
    );
    expect(() =>
      client.buildCreateJobCall({
        owner: VALID_OWNER_ID,
        targetContract: "CTARGET123",
        targetFn: "increment",
        intervalSeconds: 60,
        bountyPerRun: 200_000n,
        maxRuns: 3,
        initialFunding: 600_000n,
      }),
    ).toThrow(/Invalid targetContract: expected a valid Soroban contract ID/);

    // contract IDs are accepted where a contract is required
    expect(() =>
      client.buildCreateJobCall({
        owner: VALID_OWNER_ID,
        targetContract: VALID_TARGET_CONTRACT,
        targetFn: "increment",
        intervalSeconds: 60,
        bountyPerRun: 200_000n,
        maxRuns: 3,
        initialFunding: 600_000n,
      }),
    ).not.toThrow();
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
      owner: "GBKGRYZZEELD6POCG5E3MNMA3CT7OKF45CUX3FUDSJH6NJXAMTPXIYRS",
      targetContract: "CDSBDXYELFFHM7XMG4D4BXEVETOHQDWPQOTQLPRHGTTVW7DTNODHIIZN",
      targetFn: "get_total_keepers",
      intervalSeconds: 60,
      bountyPerRun: 200_000n,
      maxRuns: 3,
      initialFunding: 600_000n,
    });

    expect(call.method).toBe("create_job");
    expect(call.args.interval_seconds).toBe(60);
    expect(call.args.bounty_per_run).toBe("200000");
  });

  it("validates keeper and owner inputs across remaining builders", () => {
    const client = new TaktClient();

    expect(() => client.buildRequestUnbondCall("GOWNER123")).toThrow(/Invalid keeper/);
    expect(() => client.buildExecuteJobCall("GOWNER123", 1)).toThrow(/Invalid keeper/);
    expect(() => client.buildTopUpJobCall("GOWNER123", 1, 1n)).toThrow(/Invalid owner/);
    expect(() => client.buildPauseJobCall("GOWNER123", 1)).toThrow(/Invalid owner/);
    expect(() => client.buildResumeJobCall("GOWNER123", 1)).toThrow(/Invalid owner/);
    expect(() => client.buildCancelJobCall("GOWNER123", 1)).toThrow(/Invalid owner/);

    expect(() => client.buildRequestUnbondCall(VALID_KEEPER_ID)).not.toThrow();
    expect(() => client.buildExecuteJobCall(VALID_KEEPER_ID, 1)).not.toThrow();
    expect(() => client.buildTopUpJobCall(VALID_OWNER_ID, 1, 1n)).not.toThrow();
    expect(() => client.buildPauseJobCall(VALID_OWNER_ID, 1)).not.toThrow();
    expect(() => client.buildResumeJobCall(VALID_OWNER_ID, 1)).not.toThrow();
    expect(() => client.buildCancelJobCall(VALID_OWNER_ID, 1)).not.toThrow();
  });
});
