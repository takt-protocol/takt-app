import { isConnected, requestAccess } from "@stellar/freighter-api";
import { WalletMode } from "./types.js";

export const DEMO_WALLET_ADDRESS =
  "GB7T7QW7U6J6Z2F3X4V5B6N7M8K9L2P3Q4R5S6T7U8V9W2X3Y4Z5A6B7";

export interface WalletConnectionResult {
  address: string;
  mode: WalletMode;
}

export async function connectWallet(): Promise<WalletConnectionResult> {
  try {
    const status = await isConnected();
    if (status.isConnected && !status.error) {
      const access = await requestAccess();
      if (access.address && !access.error) {
        return {
          address: access.address,
          mode: "Freighter",
        };
      }
    }
  } catch {
    // Gracefully fall back to Demo Mode when Freighter extension is unavailable
  }

  return {
    address: DEMO_WALLET_ADDRESS,
    mode: "Demo Mode",
  };
}
