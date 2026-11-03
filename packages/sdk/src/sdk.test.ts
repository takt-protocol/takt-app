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
  const validPublicKey = "GBKGRYZZEELD6POCG5E3MNMA3CT7OKF45CUX3FUDSJH6NJXAMTPXIYRS";
  const validContractId = "CDSBDXYELFFHM7XMG4D4BXEVETOHQDWPQOTQLPRHGTTVW7DTNODHIIZN";
  const invalidAddress = "GBKGRYZZEELD6POCG5E3MNMA3CT7OKF45CUX3FUDSJH6NJXAMTPXIYRX"; // bad checksum
  const secretKey = "SB3K7OXXGZPO5U64DDFEBD3W4W654A6X4W2F3R7K2Q4E5R7T6Y8U9I0O"; // mock secret key

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

  describe("address and contract format validation", () => {
    it("validates 56-character Ed25519 public keys (G...)", () => {
      expect(isValidPublicKey(validPublicKey)).toBe(true);
      // Strict format: whitespace is strictly rejected
      expect(isValidPublicKey(` ${validPublicKey} `)).toBe(false);
      expect(isValidPublicKey(validContractId)).toBe(false);
      expect(isValidPublicKey(invalidAddress)).toBe(false);
      expect(isValidPublicKey("not-a-key")).toBe(false);
      expect(isValidPublicKey("")).toBe(false);
    });

    it("validates Soroban contract IDs (C...)", () => {
      expect(isValidContractId(validContractId)).toBe(true);
      // Strict format: whitespace is strictly rejected
      expect(isValidContractId(` ${validContractId} `)).toBe(false);
      expect(isValidContractId(validPublicKey)).toBe(false);
      expect(isValidContractId("CDSBDXYELFFHM7XMG4D4BXEVETOHQDWPQOTQLPRHGTTVW7DTNODHIIZX")).toBe(false);
      expect(isValidContractId("not-a-contract")).toBe(false);
      expect(isValidContractId("")).toBe(false);
    });
  });

  describe("TaktClient call builders address validation", () => {
    const client = new TaktClient();

    it("validates network configuration in constructor", () => {
      expect(
        () => new TaktClient({ keeperRegistryId: "not-a-contract" })
      ).toThrowError(/Invalid keeperRegistryId contract ID format/);
    });

    it("builds validated contract call descriptors with valid addresses", () => {
      const call = client.buildCreateJobCall({
        owner: validPublicKey,
        targetContract: validContractId,
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

    it("rejects invalid keeper addresses across keeper registry methods without leaking secrets", () => {
      expect(() => client.buildRegisterKeeperCall(secretKey, 100_000n)).toThrowError(
        /Invalid keeper address format/
      );
      // Crucial: ensure sensitive secret input is not echoed into error message
      try {
        client.buildRegisterKeeperCall(secretKey, 100_000n);
      } catch (err: any) {
        expect(err.message).not.toContain(secretKey);
      }

      expect(() => client.buildRequestUnbondCall("invalid_address")).toThrowError(
        /Invalid keeper address format/
      );
      expect(() => client.buildWithdrawStakeCall("")).toThrowError(
        /Invalid keeper address format/
      );
      expect(() => client.buildExecuteJobCall("invalid_address", 1)).toThrowError(
        /Invalid keeper address format/
      );
    });

    it("rejects invalid owner addresses across vault and job methods", () => {
      expect(() => client.buildDepositVaultCall(invalidAddress, 50_000n)).toThrowError(
        /Invalid owner address format/
      );
      expect(() => client.buildTopUpJobCall(invalidAddress, 1, 50_000n)).toThrowError(
        /Invalid owner address format/
      );
      expect(() => client.buildPauseJobCall("invalid_owner", 1)).toThrowError(
        /Invalid owner address format/
      );
      expect(() => client.buildResumeJobCall("invalid_owner", 1)).toThrowError(
        /Invalid owner address format/
      );
      expect(() => client.buildCancelJobCall("invalid_owner", 1)).toThrowError(
        /Invalid owner address format/
      );
    });

    it("rejects invalid targetContract in buildCreateJobCall when not a Soroban contract ID", () => {
      expect(() =>
        client.buildCreateJobCall({
          owner: validPublicKey,
          targetContract: validPublicKey, // G... instead of C... contract ID
          targetFn: "exec",
          intervalSeconds: 60,
          bountyPerRun: 10_000n,
          maxRuns: 1,
          initialFunding: 10_000n,
        })
      ).toThrowError(/Invalid targetContract contract ID format/);
    });
  });
});
