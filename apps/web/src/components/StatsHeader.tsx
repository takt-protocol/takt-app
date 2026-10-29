import React from "react";
import { DashboardStats } from "../types.js";
import { fromStroops } from "@takt-protocol/sdk";
import { Activity, Coins, ShieldCheck, Zap } from "lucide-react";

interface StatsHeaderProps {
  stats: DashboardStats;
}

export const StatsHeader: React.FC<StatsHeaderProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-sm font-medium">Active Automated Jobs</span>
          <Activity className="h-5 w-5 text-emerald-400"/>
        </div>
        <div className="text-3xl font-bold text-slate-100">{stats.activeJobsCount}</div>
        <div className="text-xs text-emerald-400 mt-1 flex items-center space-x-1">
          <span>+100% Soroban decentralized execution</span>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-sm font-medium">Total Vault Escrow</span>
          <Coins className="h-5 w-5 text-teal-400"/>
        </div>
        <div className="text-3xl font-bold text-slate-100">
          {fromStroops(stats.totalEscrowStroops)} <span className="text-sm font-normal text-slate-400">XLM</span>
        </div>
        <div className="text-xs text-teal-400 mt-1">Locked in BountyVault persistent state</div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-sm font-medium">Active Keepers</span>
          <ShieldCheck className="h-5 w-5 text-blue-400"/>
        </div>
        <div className="text-3xl font-bold text-slate-100">{stats.activeKeepersCount}</div>
        <div className="text-xs text-blue-400 mt-1">Staked & executing TTL maintenance</div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-sm font-medium">Protocol Fees Collected</span>
          <Zap className="h-5 w-5 text-amber-400"/>
        </div>
        <div className="text-3xl font-bold text-slate-100">
          {fromStroops(stats.protocolFeesStroops)} <span className="text-sm font-normal text-slate-400">XLM</span>
        </div>
        <div className="text-xs text-amber-400 mt-1">5% basis-point fee split allocation</div>
      </div>
    </div>
  );
};
