import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  calculateBountySplit,
  decodeContractError,
  fromStroops,
  isJobReadyForExecution,
  parseJobScVal,
  parseKeeperInfoScVal,
  parseSorobanErrorString,
  parseVaultConfigScVal,
  TaktClient,
  toStroops,
} from "./index.js";

function mapEntry(key: string, val: xdr.ScVal): xdr.ScMapEntry {
  return new xdr.ScMapEntry({
    key: xdr.ScVal.scvSymbol(key),
    val,
  });
}

describe("@takt-protocol/sdk", () => {
  const OWNER = "GBKGRYZZEELD6POCG5E3MNMA3CT7OKF45CUX3FUDSJH6NJXAMTPXIYRS";
  const CONTRACT = "CDSBDXYELFFHM7XMG4D4BXEVETOHQDWPQOTQLPRHGTTVW7DTNODHIIZN";
  const TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
  const ENGINE = "CC6ZSDYSGFAZDJ2FP2RT2ZV6NUZN4OFEWYNIS3CYOG2CBG7DIJDCWYOT";

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

  it("builds validated contract call descriptors and lifecycle builders", () => {
    const client = new TaktClient();
    const call = client.buildCreateJobCall({
      owner: OWNER,
      targetContract: CONTRACT,
      targetFn: "get_total_keepers",
      intervalSeconds: 60,
      bountyPerRun: 200_000n,
      maxRuns: 3,
      initialFunding: 600_000n,
    });

    expect(call.method).toBe("create_job");
    expect(call.args.interval_seconds).toBe(60);
    expect(call.args.bounty_per_run).toBe("200000");

    const pauseCall = client.buildPauseJobCall(OWNER, 7);
    expect(pauseCall).toEqual({
      contractId: client.config.jobEngineId,
      method: "pause_job",
      args: { owner: OWNER, job_id: 7 },
    });

    const resumeCall = client.buildResumeJobCall(OWNER, 7);
    expect(resumeCall).toEqual({
      contractId: client.config.jobEngineId,
      method: "resume_job",
      args: { owner: OWNER, job_id: 7 },
    });

    const cancelCall = client.buildCancelJobCall(OWNER, 7);
    expect(cancelCall).toEqual({
      contractId: client.config.jobEngineId,
      method: "cancel_job",
      args: { owner: OWNER, job_id: 7 },
    });

    const unbondCall = client.buildRequestUnbondCall(OWNER);
    expect(unbondCall).toEqual({
      contractId: client.config.keeperRegistryId,
      method: "request_unbond",
      args: { keeper: OWNER },
    });

    const withdrawCall = client.buildWithdrawStakeCall(OWNER);
    expect(withdrawCall).toEqual({
      contractId: client.config.keeperRegistryId,
      method: "withdraw_stake",
      args: { keeper: OWNER },
    });

    expect(() => client.buildPauseJobCall(OWNER, 0)).toThrow(
      "jobId must be a positive integer",
    );
    expect(() => client.buildResumeJobCall(OWNER, -3)).toThrow(
      "jobId must be a positive integer",
    );
    expect(() => client.buildCancelJobCall(OWNER, 0)).toThrow(
      "jobId must be a positive integer",
    );
    expect(() => client.buildCancelJobCall(OWNER, Number.NaN)).toThrow(
      "jobId must be a positive integer",
    );
  });

  it("decodes synthetic XDR ScVal structs into Job, KeeperInfo, and VaultConfig", () => {
    const argScVal = xdr.ScVal.scvU32(42);
    const largeBounty = (1n << 100n) + 123_456_789n; // > 64-bit signed i128 to test 128-bit precision
    const jobScVal = xdr.ScVal.scvMap([
      mapEntry("bounty_per_run", nativeToScVal(largeBounty, { type: "i128" })),
      mapEntry("completed_runs", xdr.ScVal.scvU32(3)),
      mapEntry("created_at", nativeToScVal(1730190000n, { type: "u64" })),
      mapEntry("id", nativeToScVal(9n, { type: "u64" })),
      mapEntry("interval_seconds", nativeToScVal(120n, { type: "u64" })),
      mapEntry("last_executed_at", nativeToScVal(1730200000n, { type: "u64" })),
      mapEntry("max_runs", xdr.ScVal.scvU32(10)),
      mapEntry("owner", Address.fromString(OWNER).toScVal()),
      mapEntry("status", xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Active")])),
      mapEntry("target_args", xdr.ScVal.scvVec([argScVal])),
      mapEntry("target_contract", Address.fromString(CONTRACT).toScVal()),
      mapEntry("target_fn", xdr.ScVal.scvSymbol("harvest_yield")),
    ]);

    const decodedJob = parseJobScVal(jobScVal.toXDR("base64"));
    expect(decodedJob).toEqual({
      id: 9,
      owner: OWNER,
      targetContract: CONTRACT,
      targetFn: "harvest_yield",
      targetArgsXdr: [argScVal.toXDR("base64")],
      intervalSeconds: 120,
      lastExecutedAt: 1730200000,
      bountyPerRun: largeBounty,
      maxRuns: 10,
      completedRuns: 3,
      status: "Active",
      createdAt: 1730190000,
    });

    const keeperScVal = xdr.ScVal.scvMap([
      mapEntry("address", Address.fromString(OWNER).toScVal()),
      mapEntry("registered_at", nativeToScVal(1730100000n, { type: "u64" })),
      mapEntry("slashes", xdr.ScVal.scvU32(1)),
      mapEntry(
        "staked_amount",
        nativeToScVal(25_000_000_000n, { type: "i128" }),
      ),
      mapEntry("status", xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Unbonding")])),
      mapEntry("total_executions", nativeToScVal(84n, { type: "u64" })),
      mapEntry(
        "unbond_unlock_time",
        nativeToScVal(1730704800n, { type: "u64" }),
      ),
    ]);

    const decodedKeeper = parseKeeperInfoScVal(keeperScVal.toXDR("base64"));
    expect(decodedKeeper).toEqual({
      address: OWNER,
      stakedAmount: 25_000_000_000n,
      status: "Unbonding",
      registeredAt: 1730100000,
      unbondUnlockTime: 1730704800,
      totalExecutions: 84,
      slashes: 1,
    });

    const vaultNoneScVal = xdr.ScVal.scvMap([
      mapEntry("admin", Address.fromString(OWNER).toScVal()),
      mapEntry("fee_bps", xdr.ScVal.scvU32(250)),
      mapEntry("job_engine", xdr.ScVal.scvVoid()),
      mapEntry("token", Address.fromString(TOKEN).toScVal()),
      mapEntry("treasury", Address.fromString(OWNER).toScVal()),
    ]);

    expect(parseVaultConfigScVal(vaultNoneScVal.toXDR("base64"))).toEqual({
      admin: OWNER,
      token: TOKEN,
      feeBps: 250,
      treasury: OWNER,
      jobEngine: null,
    });

    const vaultSomeScVal = xdr.ScVal.scvMap([
      mapEntry("admin", Address.fromString(OWNER).toScVal()),
      mapEntry("fee_bps", xdr.ScVal.scvU32(300)),
      mapEntry("job_engine", Address.fromString(ENGINE).toScVal()),
      mapEntry("token", Address.fromString(TOKEN).toScVal()),
      mapEntry("treasury", Address.fromString(OWNER).toScVal()),
    ]);

    expect(parseVaultConfigScVal(vaultSomeScVal)).toEqual({
      admin: OWNER,
      token: TOKEN,
      feeBps: 300,
      treasury: OWNER,
      jobEngine: ENGINE,
    });
  });
});
