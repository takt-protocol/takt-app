import React, { useState } from "react";
import { fromStroops } from "@takt-protocol/sdk";
import { Layers, ArrowDownLeft, ArrowUpRight, Coins, Shield, Zap } from "lucide-react";
import { VaultModal } from "./VaultModal.js";
import { TaktClient } from "@takt-protocol/sdk";

interface VaultViewProps {
  userBalance: bigint;
  walletAddress: string | null;
  client: TaktClient;
  onRefresh: () => void;
}

export const VaultView: React.FC<VaultViewProps> = ({
  userBalance,
  walletAddress,
  client,
  onRefresh,
}) => {
  const [modalMode, setModalMode] = useState<"deposit" | "withdraw" | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center space-x-2">
            <Layers className="h-6 w-6 text-teal-400"/>
            <span>Bounty Vault & Escrow Management</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Secure SEP-41 token deposits, job escrows, and 5% basis-point fee splits.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-4">
              <span className="text-sm font-medium">Your Vault Balance</span>
              <Coins className="h-5 w-5 text-teal-400"/>
            </div>
            <div className="text-4xl font-bold text-slate-100 mb-2">
              {fromStroops(userBalance)} <span className="text-sm font-normal text-slate-400">XLM</span>
            </div>
            <p className="text-xs text-slate-400">Available for job funding and withdrawals.</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => setModalMode("deposit")}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition-all shadow-lg shadow-teal-600/20"
            >
              <ArrowDownLeft className="h-4 w-4"/>
              <span>Deposit</span>
            </button>
            <button
              onClick={() => setModalMode("withdraw")}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition-all border border-slate-700"
            >
              <ArrowUpRight className="h-4 w-4"/>
              <span>Withdraw</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-4">
              <span className="text-sm font-medium">Protocol Fee Structure</span>
              <Zap className="h-5 w-5 text-amber-400"/>
            </div>
            <div className="text-3xl font-bold text-slate-100 mb-2">500 <span className="text-sm font-normal text-slate-400">BPS (5%)</span></div>
            <p className="text-xs text-slate-400">Automatically routed to protocol treasury upon successful keeper execution.</p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800 text-xs font-mono text-slate-500">
            Contract: {client.config.bountyVaultId.slice(0, 10)}...
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-4">
              <span className="text-sm font-medium">Security & TTL</span>
              <Shield className="h-5 w-5 text-blue-400"/>
            </div>
            <div className="text-3xl font-bold text-slate-100 mb-2">Extended</div>
            <p className="text-xs text-slate-400">Persistent storage TTL automatically bumped on every deposit and escrow allocation.</p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800 text-xs font-mono text-slate-500">
            Token: XLM (Native Stellar Asset)
          </div>
        </div>
      </div>

      {modalMode && (
        <VaultModal
          isOpen={!!modalMode}
          onClose={() => setModalMode(null)}
          mode={modalMode}
          walletAddress={walletAddress}
          client={client}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
};
