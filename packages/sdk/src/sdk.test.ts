import { describe, expect, it } from "vitest";
import {
  calculateBountySplit,
  decodeContractError,
  fromStroops,
  isJobReadyForExecution,
  isValidContractId,
  isValidPublicKey,
  parseJobScVal,
  parseKeeperInfoScVal,
  parseSorobanErrorString,
  parseVaultConfigScVal,
  TaktClient,
  toStroops,
} from "./index.js";
import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";

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
      expect(isValidPublicKey(` ${validPublicKey} `)).toBe(false);
      expect(isValidPublicKey(validContractId)).toBe(false);
      expect(isValidPublicKey(invalidAddress)).toBe(false);
      expect(isValidPublicKey("not-a-key")).toBe(false);
      expect(isValidPublicKey("")).toBe(false);
    });

    it("validates Soroban contract IDs (C...)", () => {
      expect(isValidContractId(validContractId)).toBe(true);
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
          targetContract: validPublicKey,
          targetFn: "exec",
          intervalSeconds: 60,
          bountyPerRun: 10_000n,
          maxRuns: 1,
          initialFunding: 10_000n,
        })
      ).toThrowError(/Invalid targetContract contract ID format/);
    });
  });

  describe("XDR ScVal typed parsers (Issue #10)", () => {
    const client = new TaktClient();
    const testKp = Keypair.random();
    const testAddress = testKp.publicKey();
    const testContract = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

    it("decodes KeeperInfo ScVal with 128-bit precision and mapped status", () => {
      const largeStake = 15_000_000_000_000_000_000n;
      const rawKeeper = {
        address: Address.fromString(testAddress),
        staked_amount: largeStake,
        status: "Active",
        registered_at: 1700000000,
        unbond_unlock_time: 0,
        total_executions: 42,
        slashes: 1,
      };

      const scVal = nativeToScVal(rawKeeper);
      const keeper = parseKeeperInfoScVal(scVal);

      expect(keeper.address).toBe(testAddress);
      expect(keeper.stakedAmount).toBe(largeStake);
      expect(keeper.status).toBe("Active");
      expect(keeper.registeredAt).toBe(1700000000);
      expect(keeper.unbondUnlockTime).toBe(0);
      expect(keeper.totalExecutions).toBe(42);
      expect(keeper.slashes).toBe(1);

      expect(client.parseKeeperInfo(scVal)).toEqual(keeper);
    });

    it("decodes Soroban vector-variant enums accurately and rejects unknown variants", () => {
      const rawKeeperPaused = {
        address: Address.fromString(testAddress),
        staked_amount: 1000n,
        status: ["Unbonding"], // Soroban vector-variant representation
        registered_at: 1700000000,
        unbond_unlock_time: 1700050000,
        total_executions: 5,
        slashes: 0,
      };
      const scValUnbonding = nativeToScVal(rawKeeperPaused);
      expect(parseKeeperInfoScVal(scValUnbonding).status).toBe("Unbonding");

      const rawKeeperUnknown = {
        ...rawKeeperPaused,
        status: "InvalidStatusVariant",
      };
      expect(() => parseKeeperInfoScVal(nativeToScVal(rawKeeperUnknown))).toThrowError(
        /Invalid or unrecognized KeeperStatus/
      );
    });

    it("decodes VaultConfig ScVal handling Option::None and Option::Some for jobEngine", () => {
      const rawVaultNone = {
        admin: Address.fromString(testAddress),
        token: Address.fromString(testContract),
        fee_bps: 250,
        treasury: Address.fromString(testAddress),
        job_engine: null,
      };
      const scValNone = nativeToScVal(rawVaultNone);
      const b64Xdr = scValNone.toXDR("base64");

      const vaultNone = parseVaultConfigScVal(b64Xdr);
      expect(vaultNone.admin).toBe(testAddress);
      expect(vaultNone.token).toBe(testContract);
      expect(vaultNone.feeBps).toBe(250);
      expect(vaultNone.treasury).toBe(testAddress);
      expect(vaultNone.jobEngine).toBeNull();

      const rawVaultSome = {
        admin: Address.fromString(testAddress),
        token: Address.fromString(testContract),
        fee_bps: 300,
        treasury: Address.fromString(testAddress),
        job_engine: Address.fromString(testContract),
      };
      const scValSome = nativeToScVal(rawVaultSome);
      const vaultSome = client.parseVaultConfig(scValSome);
      expect(vaultSome.jobEngine).toBe(testContract);
    });

    it("decodes Job ScVal with status variants, vector args, and u64 safe bounds", () => {
      const rawJob = {
        id: 204,
        owner: Address.fromString(testAddress),
        target_contract: Address.fromString(testContract),
        target_fn: "harvest",
        target_args_xdr: ["AAAAAQ==", "AAAAAg=="],
        interval_seconds: 7200,
        last_executed_at: 1710500000,
        bounty_per_run: 250_000_000n,
        max_runs: 50,
        completed_runs: 12,
        status: ["Paused"], // Vector enum variant
        created_at: 1710000000,
      };

      const scVal = nativeToScVal(rawJob);
      const job = parseJobScVal(scVal);

      expect(job.id).toBe(204);
      expect(job.owner).toBe(testAddress);
      expect(job.targetContract).toBe(testContract);
      expect(job.targetFn).toBe("harvest");
      expect(job.targetArgsXdr).toEqual(["AAAAAQ==", "AAAAAg=="]);
      expect(job.intervalSeconds).toBe(7200);
      expect(job.lastExecutedAt).toBe(1710500000);
      expect(job.bountyPerRun).toBe(250_000_000n);
      expect(job.maxRuns).toBe(50);
      expect(job.completedRuns).toBe(12);
      expect(job.status).toBe("Paused");
      expect(job.createdAt).toBe(1710000000);

      expect(client.parseJob(scVal)).toEqual(job);
    });

    it("throws descriptive errors when ScVal is not a valid map/struct or missing fields", () => {
      const nonMapScVal = xdr.ScVal.scvU32(12345);
      expect(() => parseKeeperInfoScVal(nonMapScVal)).toThrowError(/expected struct\/map representation/);
      expect(() => parseVaultConfigScVal(nonMapScVal)).toThrowError(/expected struct\/map representation/);
      expect(() => parseJobScVal(nonMapScVal)).toThrowError(/expected struct\/map representation/);

      const emptyVecScVal = xdr.ScVal.scvVec([]);
      expect(() => parseJobScVal(emptyVecScVal)).toThrowError(/expected struct\/map representation/);

      // Precision loss check
      const hugeIdJob = {
        id: 9007199254740993n, // Exceeds Number.MAX_SAFE_INTEGER
        owner: Address.fromString(testAddress),
        target_contract: Address.fromString(testContract),
        target_fn: "harvest",
        target_args_xdr: [],
        interval_seconds: 60,
        last_executed_at: 0,
        bounty_per_run: 1000n,
        max_runs: 1,
        completed_runs: 0,
        status: "Active",
        created_at: 1700000000,
      };
      expect(() => parseJobScVal(nativeToScVal(hugeIdJob))).toThrowError(/exceeds Number.MAX_SAFE_INTEGER/);
    });
  });

  describe("TaktClient Lifecycle Call Builders (Issue #11)", () => {
    const client = new TaktClient();
    const testAddress = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

    it("builds valid contract descriptors for pause_job, resume_job, cancel_job", () => {
      const pauseCall = client.buildPauseJobCall(testAddress, 42);
      expect(pauseCall).toEqual({
        contractId: client.config.jobEngineId,
        method: "pause_job",
        args: { owner: testAddress, job_id: 42 },
      });

      const resumeCall = client.buildResumeJobCall(testAddress, 42);
      expect(resumeCall).toEqual({
        contractId: client.config.jobEngineId,
        method: "resume_job",
        args: { owner: testAddress, job_id: 42 },
      });

      const cancelCall = client.buildCancelJobCall(testAddress, 42);
      expect(cancelCall).toEqual({
        contractId: client.config.jobEngineId,
        method: "cancel_job",
        args: { owner: testAddress, job_id: 42 },
      });
    });

    it("builds valid contract descriptors for request_unbond and withdraw_stake", () => {
      const unbondCall = client.buildRequestUnbondCall(testAddress);
      expect(unbondCall).toEqual({
        contractId: client.config.keeperRegistryId,
        method: "request_unbond",
        args: { keeper: testAddress },
      });

      const withdrawCall = client.buildWithdrawStakeCall(testAddress);
      expect(withdrawCall).toEqual({
        contractId: client.config.keeperRegistryId,
        method: "withdraw_stake",
        args: { keeper: testAddress },
      });
    });

    it("rejects invalid jobId (zero, negative, non-integer, unsafe integers) across all job lifecycle methods", () => {
      const invalidJobIds = [0, -1, -50, 1.25, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 1e100];

      for (const invalidId of invalidJobIds) {
        expect(() => client.buildPauseJobCall(testAddress, invalidId)).toThrowError(/must be a positive safe integer/);
        expect(() => client.buildResumeJobCall(testAddress, invalidId)).toThrowError(/must be a positive safe integer/);
        expect(() => client.buildCancelJobCall(testAddress, invalidId)).toThrowError(/must be a positive safe integer/);
        expect(() => client.buildExecuteJobCall(testAddress, invalidId)).toThrowError(/must be a positive safe integer/);
        expect(() => client.buildTopUpJobCall(testAddress, invalidId, 1000n)).toThrowError(/must be a positive safe integer/);
      }
    });

    it("rejects invalid owner or keeper addresses in lifecycle builders", () => {
      const badAddress = "GBAD123";
      expect(() => client.buildPauseJobCall(badAddress, 1)).toThrowError(/Invalid owner address/);
      expect(() => client.buildResumeJobCall(badAddress, 1)).toThrowError(/Invalid owner address/);
      expect(() => client.buildCancelJobCall(badAddress, 1)).toThrowError(/Invalid owner address/);
      expect(() => client.buildRequestUnbondCall(badAddress)).toThrowError(/Invalid keeper address/);
      expect(() => client.buildWithdrawStakeCall(badAddress)).toThrowError(/Invalid keeper address/);
    });
  });
});
