export interface User {
  username: string;
  token: string;
  peerID: string;
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
}

export interface SettlementStatus {
  proposalID: string;
  status: "posted" | "received" | "htlc_created" | "complete";
  timestamp: string;
}

export type NodeSide = "alice" | "bob";
