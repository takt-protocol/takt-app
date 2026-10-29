import React, { useState } from "react";
import { X, Shield, Coins } from "lucide-react";
import { TaktClient, toStroops } from "@takt-protocol/sdk";

interface StakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string | null;
  client: TaktClient;
  onSuccess: () => void;
}

export const StakeModal: React.FC<StakeModalProps> = ({
  isOpen,
  onClose,
  walletAddress,
  client,
  onSuccess,
}) => {
  const [stakeAmount, setStakeAmount] = useState("100.0");
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
      const stroops = toStroops(stakeAmount);
      const call = client.buildRegisterKeeperCall(walletAddress, stroops);

      console.log("Simulating register_keeper transaction descriptor:", call);
      alert(`Keeper registration descriptor prepared successfully with stake of ${stakeAmount} XLM.`);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Failed to register keeper: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-2 text-blue-400">
            <Shield className="h-5 w-5"/>
            <h3 className="text-lg font-bold text-slate-100">Register & Stake Keeper</h3>
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
            <label className="block text-xs font-medium text-slate-400 mb-1">Stake Amount (XLM)</label>
            <div className="relative">
              <Coins className="absolute left-3 top-3 h-4 w-4 text-slate-500"/>
              <input
                type="number"
                step="1"
                min="100"
                required
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Minimum protocol stake requirement is 100 XLM. Locks stake in KeeperRegistry.
            </p>
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
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              <span>{isSubmitting ? "Staking..." : "Confirm Stake"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
