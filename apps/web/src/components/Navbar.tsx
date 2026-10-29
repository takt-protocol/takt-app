import React from "react";
import { ViewTab } from "../types.js";
import { Cpu, Layers, Shield, Terminal, Wallet, CheckCircle2 } from "lucide-react";
import { shortenAddress } from "@takt-protocol/sdk";

interface NavbarProps {
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;
  walletAddress: string | null;
  onConnectWallet: () => void;
  networkName: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  walletAddress,
  onConnectWallet,
  networkName,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Cpu className="h-6 w-6 text-white"/>
          </div>
          <div>
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Takt Protocol
            </span>
            <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wide">
              {networkName}
            </span>
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
            <Cpu className="h-4 w-4"/>
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
            <Layers className="h-4 w-4"/>
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
            <Shield className="h-4 w-4"/>
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
            <Terminal className="h-4 w-4"/>
            <span>Deployment</span>
          </button>
        </nav>

        <div>
          {walletAddress ? (
            <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-400"/>
              <span className="font-mono text-slate-200">{shortenAddress(walletAddress)}</span>
            </div>
          ) : (
            <button
              onClick={onConnectWallet}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all shadow-lg shadow-emerald-600/20"
            >
              <Wallet className="h-4 w-4"/>
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
