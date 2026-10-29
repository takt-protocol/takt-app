import React, { useState } from "react";
import { Job } from "@takt-protocol/sdk";
import { fromStroops, shortenAddress } from "@takt-protocol/sdk";
import { Cpu, Plus, Play, Pause, XCircle, Clock, Coins, CheckCircle } from "lucide-react";
import { CreateJobModal } from "./CreateJobModal.js";
import { TaktClient } from "@takt-protocol/sdk";

interface JobsViewProps {
  jobs: Job[];
  walletAddress: string | null;
  client: TaktClient;
  onRefresh: () => void;
}

export const JobsView: React.FC<JobsViewProps> = ({
  jobs,
  walletAddress,
  client,
  onRefresh,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center space-x-2">
            <Cpu className="h-6 w-6 text-emerald-400"/>
            <span>Job Engine & Task Automation</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Decentralized cron jobs powered by Soroban smart contracts and keeper networks.
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="h-4 w-4"/>
          <span>Create Job</span>
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center backdrop-blur">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
            <Cpu className="h-6 w-6"/>
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-1">No Active Jobs Found</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
            Schedule your first decentralized automation task with custom execution intervals and bounty rewards.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all"
          >
            <Plus className="h-4 w-4"/>
            <span>Schedule First Job</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur flex flex-col justify-between hover:border-slate-700 transition-all shadow-xl"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                    Job #{job.id}
                  </span>
                  <span
                    className={`px-3 py-1 text-xs font-medium rounded-full border flex items-center space-x-1 ${
                      job.status === "Active"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : job.status === "Paused"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : job.status === "Completed"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}
                  >
                    {job.status === "Active" && <CheckCircle className="h-3 w-3"/>}
                    {job.status === "Paused" && <Clock className="h-3 w-3"/>}
                    {job.status === "Cancelled" && <XCircle className="h-3 w-3"/>}
                    <span>{job.status}</span>
                  </span>
                </div>

                <div className="space-y-3 mb-6">
                  <div>
                    <span className="text-xs text-slate-500 block mb-0.5">Target Contract</span>
                    <span className="font-mono text-sm text-slate-200">{shortenAddress(job.targetContract, 6)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                      <span className="text-xs text-slate-500 block mb-0.5">Function</span>
                      <span className="font-mono text-xs text-emerald-400 font-medium">{job.targetFn}</span>
                    </div>
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                      <span className="text-xs text-slate-500 block mb-0.5">Interval</span>
                      <span className="text-xs text-slate-200 font-medium flex items-center space-x-1">
                        <Clock className="h-3 w-3 text-slate-400"/>
                        <span>{job.intervalSeconds}s</span>
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                      <span className="text-xs text-slate-500 block mb-0.5">Bounty / Run</span>
                      <span className="text-xs text-teal-400 font-semibold flex items-center space-x-1">
                        <Coins className="h-3 w-3"/>
                        <span>{fromStroops(job.bountyPerRun)} XLM</span>
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                      <span className="text-xs text-slate-500 block mb-0.5">Progress</span>
                      <span className="text-xs text-slate-200 font-medium">
                        {job.completedRuns} / {job.maxRuns === 0 ? "∞" : job.maxRuns}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-mono">
                  Owner: {shortenAddress(job.owner, 3)}
                </span>
                <div className="flex items-center space-x-2">
                  {job.status === "Active" ? (
                    <button
                      onClick={() => alert(`Simulating pause_job for Job #${job.id}`)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 transition-colors"
                      title="Pause Job"
                    >
                      <Pause className="h-4 w-4"/>
                    </button>
                  ) : job.status === "Paused" ? (
                    <button
                      onClick={() => alert(`Simulating resume_job for Job #${job.id}`)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                      title="Resume Job"
                    >
                      <Play className="h-4 w-4"/>
                    </button>
                  ) : null}
                  <button
                    onClick={() => alert(`Simulating cancel_job & escrow refund for Job #${job.id}`)}
                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                    title="Cancel & Refund Escrow"
                  >
                    <XCircle className="h-4 w-4"/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateJobModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        walletAddress={walletAddress}
        client={client}
        onJobCreated={onRefresh}
      />
    </div>
  );
};
