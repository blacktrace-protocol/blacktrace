export interface User {
  username: string;
  token: string;
  peerID: string;
}

export interface Order {
  id: string;
  asset: string;
  amount: number;
  price: number;
  side: "buy" | "sell";
  stablecoin: string;
  creatorID: string;
  timestamp: string;
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
