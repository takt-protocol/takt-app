import {
  getAddress,
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";

export type ConnectionMode = "freighter" | "demo";

export interface ConnectedWallet {
  address: string;
  mode: ConnectionMode;
}

// Canonical demo wallet address (valid Stellar testnet Ed25519 public key)
export const DEMO_WALLET_ADDRESS =
  "GBOZGUMYRGUHH6VCKP2OTRFXRLF3AWN3P7PIOAUJOHVMC4RUP5EKG5OW";

/**
 * Checks if Freighter extension is installed and available in the browser.
 */
export async function isFreighterAvailable(): Promise<boolean> {
  try {
    const result = await isConnected();
    if (typeof result === "boolean") {
      return result;
    }
    return Boolean(result?.isConnected && !result?.error);
  } catch {
    return false;
  }
}

/**
 * Connects to Freighter if available; otherwise falls back to Demo Mode.
 */
export async function connectWallet(): Promise<ConnectedWallet> {
  try {
    const available = await isFreighterAvailable();
    if (available) {
      // First attempt requestAccess to request permissions from the user
      const accessRes = await requestAccess();
      if (accessRes?.address && !accessRes.error) {
        return {
          address: accessRes.address,
          mode: "freighter",
        };
      }
      // Alternatively try getAddress if already approved
      const addrRes = await getAddress();
      if (addrRes?.address && !addrRes.error) {
        return {
          address: addrRes.address,
          mode: "freighter",
        };
      }
    }
  } catch (error) {
    console.warn("Freighter connection failed; falling back to demo wallet:", error);
  }

  return {
    address: DEMO_WALLET_ADDRESS,
    mode: "demo",
  };
}
