import React from "react";
import { ViewTab } from "../types.js";
import {
  Cpu,
  Layers,
  Shield,
  Terminal,
  Wallet,
  CheckCircle2,
  Activity,
  RefreshCw,
} from "lucide-react";
import { shortenAddress } from "@takt-protocol/sdk";

interface NavbarProps {
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;
  walletAddress: string | null;
  onConnectWallet: () => void;
  networkName: string;
  rpcStatus?: "healthy" | "offline";
  latestLedger?: number | null;
  isRefreshingRpc?: boolean;
  onRefreshRpc?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  walletAddress,
  onConnectWallet,
  networkName,
  rpcStatus = "offline",
  latestLedger = null,
  isRefreshingRpc = false,
  onRefreshRpc,
}) => {
  const isHealthy = rpcStatus === "healthy";

  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Cpu className="h-6 w-6 text-white" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Takt Protocol
            </span>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wide">
              {networkName}
            </span>
            <div
              className={`hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                isHealthy
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-300 border-amber-500/20"
              }`}
            >
              <Activity className="h-3 w-3" />
              <span>
                {isHealthy
                  ? latestLedger
                    ? `RPC Online · #${latestLedger.toLocaleString()}`
                    : "RPC Online"
                  : "RPC Offline / Simulated"}
              </span>
              {onRefreshRpc && (
                <button
                  onClick={onRefreshRpc}
                  className="ml-1 text-slate-400 hover:text-slate-100 transition-colors"
                  title="Refresh Soroban RPC status"
                  type="button"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${isRefreshingRpc ? "animate-spin" : ""}`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        <nav className="hidden md:flex items-center space-x-1">
          <button
            onClick={() => setActiveTab("jobs")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
              activeTab === "jobs"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Cpu className="h-4 w-4" />
            <span>Job Engine</span>
          </button>
          <button
            onClick={() => setActiveTab("vault")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
              activeTab === "vault"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Bounty Vault</span>
          </button>
          <button
            onClick={() => setActiveTab("keepers")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
              activeTab === "keepers"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>Keepers</span>
          </button>
          <button
            onClick={() => setActiveTab("deploy")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
              activeTab === "deploy"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>Deployment</span>
          </button>
        </nav>

        <div>
          {walletAddress ? (
            <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="font-mono text-slate-200">
                {shortenAddress(walletAddress)}
              </span>
            </div>
          ) : (
            <button
              onClick={onConnectWallet}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all shadow-lg shadow-emerald-600/20"
            >
              <Wallet className="h-4 w-4" />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
