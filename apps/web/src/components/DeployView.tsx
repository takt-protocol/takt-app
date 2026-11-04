import React, { useState } from "react";
import { TaktClient } from "@takt-protocol/sdk";
import { Terminal, Copy, Check, ExternalLink, Shield, Layers, Cpu, Coins, RefreshCw, Activity } from "lucide-react";

export interface DeployRpcHealth {
  status: string;
  latestLedger?: number;
  latestLedgerCloseTime?: string;
  oldestLedger?: number;
  isSimulated?: boolean;
  isLoading?: boolean;
  lastCheckedAt?: Date | null;
  error?: string | null;
}

interface DeployViewProps {
  client: TaktClient;
  rpcHealth?: DeployRpcHealth | null;
  onRefreshRpc?: () => void;
}

export const DeployView: React.FC<DeployViewProps> = ({ client, rpcHealth, onRefreshRpc }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const contracts = [
    { name: "Keeper Registry", id: client.config.keeperRegistryId, icon: Shield, color: "text-blue-400" },
    { name: "Bounty Vault", id: client.config.bountyVaultId, icon: Layers, color: "text-teal-400" },
    { name: "Job Engine", id: client.config.jobEngineId, icon: Cpu, color: "text-emerald-400" },
    { name: "Stake Token (XLM)", id: client.config.tokenAddress, icon: Coins, color: "text-amber-400" },
  ];

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100 flex items-center space-x-2">
          <Terminal className="h-6 w-6 text-emerald-400"/>
          <span>Contract Deployment & Network Config</span>
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Inspect deployed Takt Protocol smart contract IDs and network passphrases on Stellar {client.config.network}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur shadow-xl space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">Deployed Contract Addresses</h3>
          <div className="space-y-3">
            {contracts.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.name} className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg bg-slate-900 border border-slate-800 ${c.color}`}>
                      <Icon className="h-4 w-4"/>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block">{c.name}</span>
                      <span className="font-mono text-xs text-slate-200">{c.id}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(c.name, c.id)}
                    className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors border border-slate-800"
                    title="Copy Address"
                  >
                    {copiedKey === c.name ? <Check className="h-4 w-4 text-emerald-400"/> : <Copy className="h-4 w-4"/>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur shadow-xl space-y-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-200">RPC & Network Parameters</h3>
              {onRefreshRpc && (
                <button
                  onClick={onRefreshRpc}
                  disabled={rpcHealth?.isLoading}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 disabled:opacity-50"
                  title="Query Soroban RPC live status"
                >
                  <RefreshCw className={`h-3 w-3 ${rpcHealth?.isLoading ? "animate-spin" : ""}`} />
                  <span>{rpcHealth?.isLoading ? "Syncing..." : "Refresh RPC"}</span>
                </button>
              )}
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Network Name</span>
                <span className="font-mono text-emerald-400 capitalize">{client.config.network}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Soroban RPC URL</span>
                <span className="font-mono text-slate-200 text-xs">{client.config.rpcUrl}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">RPC Health</span>
                {rpcHealth?.isLoading ? (
                  <span className="text-xs text-slate-400">Querying RPC...</span>
                ) : rpcHealth?.isSimulated || rpcHealth?.status === "offline" ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                    <span>Offline / Simulated</span>
                  </span>
                ) : rpcHealth?.status === "healthy" ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Healthy (Live Connected)</span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">Unchecked</span>
                )}
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Latest Ledger Height</span>
                <span className="font-mono text-slate-200 text-xs">
                  {rpcHealth?.latestLedger ? rpcHealth.latestLedger.toLocaleString() : "Simulation Default"}
                </span>
              </div>
              {rpcHealth?.latestLedgerCloseTime && (
                <div className="flex justify-between py-2 border-b border-slate-800/60">
                  <span className="text-slate-400">Ledger Close Time</span>
                  <span className="font-mono text-slate-400 text-xs">
                    {new Date(parseInt(rpcHealth.latestLedgerCloseTime) * 1000).toLocaleTimeString()} ({rpcHealth.latestLedgerCloseTime})
                  </span>
                </div>
              )}
              {rpcHealth?.lastCheckedAt && (
                <div className="flex justify-between py-2 border-b border-slate-800/60">
                  <span className="text-slate-400">Last Synced</span>
                  <span className="font-mono text-slate-400 text-xs">
                    {rpcHealth.lastCheckedAt.toLocaleTimeString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Network Passphrase</span>
                <span className="font-mono text-slate-200 text-xs truncate max-w-[200px]" title={client.config.networkPassphrase}>
                  {client.config.networkPassphrase}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">Verified via Stellar Explorer</span>
            <a
              href={`https://stellar.expert/explorer/${client.config.network}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              <span>Open Explorer</span>
              <ExternalLink className="h-3.5 w-3.5"/>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
