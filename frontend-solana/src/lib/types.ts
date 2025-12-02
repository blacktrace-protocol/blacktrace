export interface User {
  username: string;
  token: string;
  peerID: string;
  zcash_address?: string;
  private_key?: string;   // WIF format private key for signing
  pubkey?: string;        // Compressed public key (hex)
  pubkey_hash?: string;   // HASH160 of pubkey (hex) - used in HTLC scripts
}

export interface Order {
  id: string;
  order_type: string;
  stablecoin: string;
  amount: number;
  min_price: number;
  max_price: number;
  timestamp: number; // Unix seconds
  expiry: number;
  settlement_chain?: 'starknet' | 'solana'; // Target settlement chain
}

export interface Proposal {
  id: string;
  orderID: string;
  proposerID: string;
  amount: number;
  price: number;
  encrypted: boolean;
  encryptedData?: string;
  timestamp: string;
  status: "pending" | "accepted" | "rejected";
  settlement_status?: "ready" | "alice_locked" | "bob_locked" | "both_locked" | "alice_claimed" | "strk_claimed" | "sol_claimed" | "claiming" | "complete";
  settlement_chain?: 'starknet' | 'solana'; // Target settlement chain
  hash_lock?: string; // HTLC hash lock (set when Alice locks ZEC, Bob uses this for Starknet HTLC)
}

export interface SettlementStatus {
  proposalID: string;
  status: "posted" | "received" | "htlc_created" | "complete";
  timestamp: string;
}

export type NodeSide = "alice" | "bob";
