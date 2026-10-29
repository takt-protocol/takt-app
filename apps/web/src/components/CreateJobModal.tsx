import React, { useState } from "react";
import { X, PlusCircle, Cpu, Clock, Coins, Hash } from "lucide-react";
import { TaktClient, toStroops } from "@takt-protocol/sdk";

interface CreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string | null;
  client: TaktClient;
  onJobCreated: () => void;
}

export const CreateJobModal: React.FC<CreateJobModalProps> = ({
  isOpen,
  onClose,
  walletAddress,
  client,
  onJobCreated,
}) => {
  const [targetContract, setTargetContract] = useState("");
  const [targetFn, setTargetFn] = useState("increment");
  const [intervalSeconds, setIntervalSeconds] = useState("60");
  const [bountyPerRun, setBountyPerRun] = useState("1.0");
  const [maxRuns, setMaxRuns] = useState("10");
  const [initialFunding, setInitialFunding] = useState("15.0");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress) {
      alert("Please connect your wallet first.");
      return;
    }

    try {
      setIsSubmitting(true);
      const call = client.buildCreateJobCall({
        owner: walletAddress,
        targetContract: targetContract.trim(),
        targetFn: targetFn.trim(),
        intervalSeconds: Number.parseInt(intervalSeconds, 10),
        bountyPerRun: toStroops(bountyPerRun),
        maxRuns: Number.parseInt(maxRuns, 10),
        initialFunding: toStroops(initialFunding),
      });

      console.log("Simulating create_job transaction descriptor:", call);
      alert(`Job creation descriptor prepared successfully for contract ${targetContract.slice(0, 6)}...`);
      onJobCreated();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Failed to create job: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-2 text-emerald-400">
            <Cpu className="h-5 w-5"/>
            <h3 className="text-lg font-bold text-slate-100">Schedule Automated Job</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5"/>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Target Contract Address (Soroban)</label>
            <input
              type="text"
              required
              placeholder="C..."
              value={targetContract}
              onChange={(e) => setTargetContract(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Target Function Name</label>
              <input
                type="text"
                required
                value={targetFn}
                onChange={(e) => setTargetFn(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Interval (Seconds)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-slate-500"/>
                <input
                  type="number"
                  min="5"
                  required
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Bounty Per Run (XLM)</label>
              <div className="relative">
                <Coins className="absolute left-3 top-3 h-4 w-4 text-slate-500"/>
                <input
                  type="number"
                  step="0.0000001"
                  min="0.0000001"
                  required
                  value={bountyPerRun}
                  onChange={(e) => setBountyPerRun(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Max Runs (0 = Unlimited)</label>
              <div className="relative">
                <Hash className="absolute left-3 top-3 h-4 w-4 text-slate-500"/>
                <input
                  type="number"
                  min="0"
                  required
                  value={maxRuns}
                  onChange={(e) => setMaxRuns(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Initial Vault Funding (XLM)</label>
            <input
              type="number"
              step="0.0000001"
              required
              value={initialFunding}
              onChange={(e) => setInitialFunding(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
            />
            <p className="text-xs text-slate-500 mt-1">Locked in BountyVault escrow for automated execution payouts.</p>
          </div>

          <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              <PlusCircle className="h-4 w-4"/>
              <span>{isSubmitting ? "Creating..." : "Deploy Job"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
