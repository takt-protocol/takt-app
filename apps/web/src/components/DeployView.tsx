import React, { useState } from "react";
import {
  TaktClient,
  decodeContractError,
  parseSorobanErrorString,
  type DecodedContractError,
  type TaktContractSource,
} from "@takt-protocol/sdk";
import { Terminal, Copy, Check, ExternalLink, Shield, Layers, Cpu, Coins, Search } from "lucide-react";

interface DeployViewProps {
  client: TaktClient;
}

const ERROR_SOURCES: { value: TaktContractSource; label: string }[] = [
  { value: "keeper-registry", label: "Keeper Registry" },
  { value: "bounty-vault", label: "Bounty Vault" },
  { value: "job-engine", label: "Job Engine" },
];

export const DeployView: React.FC<DeployViewProps> = ({ client }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<TaktContractSource>("keeper-registry");
  const [errorInput, setErrorInput] = useState("");

  const trimmedErrorInput = errorInput.trim();
  let decodedError: DecodedContractError | null = null;
  if (/^\d+$/.test(trimmedErrorInput)) {
    decodedError = decodeContractError(errorSource, Number.parseInt(trimmedErrorInput, 10));
  } else if (trimmedErrorInput) {
    decodedError = parseSorobanErrorString(errorSource, trimmedErrorInput);
  }

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
            <h3 className="text-lg font-semibold text-slate-200 mb-4">RPC & Network Parameters</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Network Name</span>
                <span className="font-mono text-emerald-400 capitalize">{client.config.network}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Soroban RPC URL</span>
                <span className="font-mono text-slate-200 text-xs">{client.config.rpcUrl}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Network Passphrase</span>
                <span className="font-mono text-slate-200 text-xs truncate max-w-[200px]">{client.config.networkPassphrase}</span>
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

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur shadow-xl space-y-4">
        <div className="flex items-center space-x-2">
          <Search className="h-5 w-5 text-amber-400"/>
          <h3 className="text-lg font-semibold text-slate-200">Contract Error Decoder</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1.5 text-sm">
            <span className="text-slate-400">Contract source</span>
            <select
              value={errorSource}
              onChange={(e) => setErrorSource(e.target.value as TaktContractSource)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              {ERROR_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="md:col-span-2 space-y-1.5 text-sm">
            <span className="text-slate-400">Error code or diagnostic string</span>
            <input
              type="text"
              value={errorInput}
              onChange={(e) => setErrorInput(e.target.value)}
              placeholder="e.g. 4 or Error(Contract, #4)"
              className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </label>
        </div>
        {trimmedErrorInput && !decodedError && (
          <p className="text-sm text-rose-400">
            No Error(Contract, #n) code found in this input.
          </p>
        )}
        {decodedError && (
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-amber-400">{decodedError.name}</span>
              <span className="font-mono text-xs text-slate-500">#{decodedError.code}</span>
            </div>
            <p className="text-sm text-slate-300">{decodedError.message}</p>
          </div>
        )}
      </div>
    </div>
  );
};
