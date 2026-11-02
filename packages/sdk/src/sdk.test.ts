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

const VALID_PUBKEY = "GALPL4V6YTRQLIPQNIWHRFDVGBJOBGXVOWR6OECORWQAAN4URJDMTSV3";
const VALID_CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const INVALID_ADDRESS = "INVALID_NOT_A_VALID_STELLAR_KEY_12345";

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

  describe("address validators", () => {
    it("validates Stellar public keys correctly", () => {
      expect(isValidPublicKey(VALID_PUBKEY)).toBe(true);
      expect(isValidPublicKey(VALID_CONTRACT_ID)).toBe(false);
      expect(isValidPublicKey(INVALID_ADDRESS)).toBe(false);
      expect(isValidPublicKey("")).toBe(false);
    });

    it("validates Soroban contract IDs correctly", () => {
      expect(isValidContractId(VALID_CONTRACT_ID)).toBe(true);
      expect(isValidContractId(VALID_PUBKEY)).toBe(false);
      expect(isValidContractId(INVALID_ADDRESS)).toBe(false);
      expect(isValidContractId("")).toBe(false);
    });
  });

  describe("TaktClient call builders", () => {
    const client = new TaktClient();

    it("builds validated contract call descriptors with valid addresses", () => {
      const call = client.buildCreateJobCall({
        owner: VALID_PUBKEY,
        targetContract: VALID_CONTRACT_ID,
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

    it("rejects invalid keeper addresses in keeper-related calls", () => {
      expect(() => client.buildRegisterKeeperCall(INVALID_ADDRESS, 1_000_000n)).toThrow(
        /Invalid keeper public key/,
      );
      expect(() => client.buildRequestUnbondCall(INVALID_ADDRESS)).toThrow(
        /Invalid keeper public key/,
      );
      expect(() => client.buildWithdrawStakeCall(INVALID_ADDRESS)).toThrow(
        /Invalid keeper public key/,
      );
      expect(() => client.buildExecuteJobCall(INVALID_ADDRESS, 1)).toThrow(
        /Invalid keeper public key/,
      );
    });

    it("rejects invalid owner addresses in vault and job management calls", () => {
      expect(() => client.buildDepositVaultCall(INVALID_ADDRESS, 500_000n)).toThrow(
        /Invalid owner public key/,
      );
      expect(() => client.buildTopUpJobCall(INVALID_ADDRESS, 1, 500_000n)).toThrow(
        /Invalid owner public key/,
      );
      expect(() => client.buildPauseJobCall(INVALID_ADDRESS, 1)).toThrow(
        /Invalid owner public key/,
      );
      expect(() => client.buildResumeJobCall(INVALID_ADDRESS, 1)).toThrow(
        /Invalid owner public key/,
      );
      expect(() => client.buildCancelJobCall(INVALID_ADDRESS, 1)).toThrow(
        /Invalid owner public key/,
      );
    });

    it("rejects invalid owner or targetContract in buildCreateJobCall", () => {
      expect(() =>
        client.buildCreateJobCall({
          owner: INVALID_ADDRESS,
          targetContract: VALID_CONTRACT_ID,
          targetFn: "increment",
          intervalSeconds: 60,
          bountyPerRun: 200_000n,
          maxRuns: 3,
          initialFunding: 600_000n,
        }),
      ).toThrow(/Invalid owner public key/);

      expect(() =>
        client.buildCreateJobCall({
          owner: VALID_PUBKEY,
          targetContract: INVALID_ADDRESS,
          targetFn: "increment",
          intervalSeconds: 60,
          bountyPerRun: 200_000n,
          maxRuns: 3,
          initialFunding: 600_000n,
        }),
      ).toThrow(/Invalid targetContract address/);
    });
  });
});
