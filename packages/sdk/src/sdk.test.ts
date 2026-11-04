import { describe, expect, it, vi } from "vitest";
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

  it("queries getHealth and parses RPC result successfully", async () => {
    const mockResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        status: "healthy",
        latestLedger: 5553810,
        latestLedgerCloseTime: "1793792690",
        oldestLedger: 5432851,
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    try {
      const client = new TaktClient();
      const health = await client.getHealth();
      expect(health.status).toBe("healthy");
      expect(health.latestLedger).toBe(5553810);
      expect(health.latestLedgerCloseTime).toBe("1793792690");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws descriptive error when RPC returns an error payload", async () => {
    const mockErrorResponse = {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32603, message: "Internal RPC error" },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockErrorResponse,
    } as Response);

    try {
      const client = new TaktClient();
      await expect(client.getHealth()).rejects.toThrow("Internal RPC error");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects malformed RPC result missing valid status", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: { no_status: true } }),
    } as Response);

    try {
      const client = new TaktClient();
      await expect(client.getHealth()).rejects.toThrow("Malformed RPC result: missing valid status field");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles HTTP error status codes", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as Response);

    try {
      const client = new TaktClient();
      await expect(client.getHealth()).rejects.toThrow("RPC HTTP error 503: Service Unavailable");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
