import { create } from 'zustand';
import type { User, Order, Proposal, SettlementStatus, NodeSide } from './types';

interface AppState {
  // Alice state
  alice: {
    user: User | null;
    orders: Order[];
    proposals: Proposal[];
    peerID: string | null;
  };
  // Bob state
  bob: {
    user: User | null;
    orders: Order[];
    proposals: Proposal[];
    peerID: string | null;
  };
  // Settlement state
  settlement: SettlementStatus | null;

  // Actions
  setUser: (side: NodeSide, user: User) => void;
  logout: (side: NodeSide) => void;
  setOrders: (side: NodeSide, orders: Order[]) => void;
  setProposals: (side: NodeSide, proposals: Proposal[]) => void;
  addOrder: (side: NodeSide, order: Order) => void;
  addProposal: (side: NodeSide, proposal: Proposal) => void;
  updateProposal: (side: NodeSide, proposalID: string, updates: Partial<Proposal>) => void;
  setSettlement: (settlement: SettlementStatus) => void;
  setPeerID: (side: NodeSide, peerID: string) => void;
}

export const useStore = create<AppState>((set) => ({
  alice: {
    user: null,
    orders: [],
    proposals: [],
    peerID: null,
  },
  bob: {
    user: null,
    orders: [],
    proposals: [],
    peerID: null,
  },
  settlement: null,

  setUser: (side, user) =>
    set((state) => ({
      [side]: {
        ...state[side],
        user,
      },
    })),

  logout: (side) =>
    set((state) => ({
      [side]: {
        ...state[side],
        user: null,
        orders: [],
        proposals: [],
      },
    })),

  setOrders: (side, orders) =>
    set((state) => ({
      [side]: {
        ...state[side],
        orders,
      },
    })),

  setProposals: (side, proposals) =>
    set((state) => ({
      [side]: {
        ...state[side],
        proposals,
      },
    })),

  addOrder: (side, order) =>
    set((state) => ({
      [side]: {
        ...state[side],
        orders: [...state[side].orders, order],
      },
    })),

  addProposal: (side, proposal) =>
    set((state) => ({
      [side]: {
        ...state[side],
        proposals: [...state[side].proposals, proposal],
      },
    })),

  updateProposal: (side, proposalID, updates) =>
    set((state) => ({
      [side]: {
        ...state[side],
        proposals: state[side].proposals.map((p) =>
          p.id === proposalID ? { ...p, ...updates } : p
        ),
      },
    })),

  setSettlement: (settlement) => set({ settlement }),

  setPeerID: (side, peerID) =>
    set((state) => ({
      [side]: {
        ...state[side],
        peerID,
      },
    })),
}));
