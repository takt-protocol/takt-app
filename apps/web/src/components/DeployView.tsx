import React, { useState, useMemo } from "react";
import {
  TaktClient,
  decodeContractError,
  parseSorobanErrorString,
  TaktContractSource,
  DecodedContractError,
} from "@takt-protocol/sdk";
import {
  Terminal,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Layers,
  Cpu,
  Coins,
  Search,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

interface DeployViewProps {
  client: TaktClient;
}

export const DeployView: React.FC<DeployViewProps> = ({ client }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<TaktContractSource>("job-engine");
  const [errorInput, setErrorInput] = useState<string>("Error(Contract, #10)");

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

  const decodedResult: DecodedContractError | null = useMemo(() => {
    const trimmed = errorInput.trim();
    if (!trimmed) return null;

    if (/Error\(Contract/i.test(trimmed)) {
      return parseSorobanErrorString(selectedSource, trimmed);
    }

    const codeNum = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(codeNum) && String(codeNum) === trimmed) {
      return decodeContractError(selectedSource, codeNum);
    }

    return parseSorobanErrorString(selectedSource, trimmed);
  }, [selectedSource, errorInput]);

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

      {/* Interactive Contract Error Decoder Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Search className="h-5 w-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-slate-200">Interactive Contract Error Decoder</h3>
          </div>
          <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full font-mono">
            Soroban Diagnostic Tool
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Decode raw contract error diagnostic strings or numeric exit codes into human-readable explanations.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label htmlFor="error-decoder-source" className="text-xs font-medium text-slate-400 block mb-1.5">Target Contract</label>
            <select
              id="error-decoder-source"
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value as TaktContractSource)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="job-engine">Job Engine</option>
              <option value="bounty-vault">Bounty Vault</option>
              <option value="keeper-registry">Keeper Registry</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="error-decoder-input" className="text-xs font-medium text-slate-400 block mb-1.5">
              Error Input (Numeric Code or Soroban Diagnostic String)
            </label>
            <input
              id="error-decoder-input"
              type="text"
              value={errorInput}
              onChange={(e) => setErrorInput(e.target.value)}
              placeholder="e.g. 10 or Error(Contract, #10)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {decodedResult ? (
          <div className="mt-4 p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className={`h-4 w-4 ${decodedResult.name === "UnknownContractError" ? "text-amber-400" : "text-emerald-400"}`} />
                <span className="font-semibold text-slate-200 text-sm">{decodedResult.name}</span>
                <span className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                  Code #{decodedResult.code}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-mono capitalize">{decodedResult.source}</span>
            </div>
            <p className="text-sm text-slate-300 pl-6">{decodedResult.message}</p>
          </div>
        ) : errorInput.trim() ? (
          <div className="mt-4 p-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-xs text-slate-500 flex items-center space-x-2">
            <HelpCircle className="h-4 w-4 text-slate-500" />
            <span>Could not extract error code. Expected numeric code (e.g. 4) or formatted diagnostic string (e.g. Error(Contract, #4)).</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
