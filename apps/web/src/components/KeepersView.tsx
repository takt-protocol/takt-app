import React, { useState } from "react";
import { KeeperInfo } from "@takt-protocol/sdk";
import { fromStroops, shortenAddress } from "@takt-protocol/sdk";
import { Shield, Plus, ShieldCheck, Award, AlertTriangle, Lock } from "lucide-react";
import { StakeModal } from "./StakeModal.js";
import { TaktClient } from "@takt-protocol/sdk";

interface KeepersViewProps {
  keepers: KeeperInfo[];
  walletAddress: string | null;
  client: TaktClient;
  onRefresh: () => void;
}

export const KeepersView: React.FC<KeepersViewProps> = ({
  keepers,
  walletAddress,
  client,
  onRefresh,
}) => {
  const [isStakeOpen, setIsStakeOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center space-x-2">
            <Shield className="h-6 w-6 text-blue-400"/>
            <span>Keeper Network & Staking</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Decentralized keeper nodes ensuring reliable task execution and TTL maintenance.
          </p>
        </div>
        <button
          onClick={() => setIsStakeOpen(true)}
          className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all shadow-lg shadow-blue-600/20"
        >
          <Plus className="h-4 w-4"/>
          <span>Register Keeper</span>
        </button>
      </div>

      {keepers.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center backdrop-blur">
          <div className="h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
            <Shield className="h-6 w-6"/>
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-1">No Active Keepers Registered</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            Stake XLM tokens in KeeperRegistry to participate in decentralized job execution and earn fee bounties.
          </p>
          <button
            onClick={() => setIsStakeOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all"
          >
            <Plus className="h-4 w-4"/>
            <span>Register as Keeper</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {keepers.map((keeper) => (
            <div
              key={keeper.address}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur flex flex-col justify-between shadow-xl"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-sm text-slate-200 font-semibold">
                    {shortenAddress(keeper.address, 6)}
                  </span>
                  <span
                    className={`px-3 py-1 text-xs font-medium rounded-full border flex items-center space-x-1 ${
                      keeper.status === "Active"
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        : keeper.status === "Unbonding"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}
                  >
                    <ShieldCheck className="h-3 w-3"/>
                    <span>{keeper.status}</span>
                  </span>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                    <span className="text-xs text-slate-500 block mb-1">Staked Amount</span>
                    <span className="text-lg font-bold text-slate-100 flex items-center space-x-1">
                      <Lock className="h-4 w-4 text-blue-400"/>
                      <span>{fromStroops(BigInt(keeper.stakedAmount))} XLM</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                      <span className="text-xs text-slate-500 block mb-0.5">Executions</span>
                      <span className="text-sm font-semibold text-emerald-400 flex items-center space-x-1">
                        <Award className="h-3.5 w-3.5"/>
                        <span>{keeper.totalExecutions}</span>
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                      <span className="text-xs text-slate-500 block mb-0.5">Slashes</span>
                      <span className="text-sm font-semibold text-rose-400 flex items-center space-x-1">
                        <AlertTriangle className="h-3.5 w-3.5"/>
                        <span>{keeper.slashes}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <span>Registered: #{keeper.registeredAt}</span>
                {keeper.status === "Active" && (
                  <button
                    onClick={() => alert(`Simulating request_unbond for keeper ${shortenAddress(keeper.address, 4)}`)}
                    className="text-amber-400 hover:text-amber-300 font-medium transition-colors"
                  >
                    Request Unbond
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <StakeModal
        isOpen={isStakeOpen}
        onClose={() => setIsStakeOpen(false)}
        walletAddress={walletAddress}
        client={client}
        onSuccess={onRefresh}
      />
    </div>
  );
};
