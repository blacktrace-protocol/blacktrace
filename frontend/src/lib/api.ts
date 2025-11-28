import axios, { type AxiosInstance } from 'axios';
import type { User, Order, Proposal } from './types';

// Backend proposal response format
interface BackendProposal {
  proposal_id: string;
  order_id: string;
  proposer_id: string;
  amount: number;
  price: number;
  encrypted?: boolean;
  encrypted_data?: string;
  timestamp: string;
  status: string;
  settlement_status?: string;
  hash_lock?: string;
}

// Map backend proposal format to frontend format
function mapProposal(backendProposal: BackendProposal): Proposal {
  return {
    id: backendProposal.proposal_id,
    orderID: backendProposal.order_id,
    proposerID: backendProposal.proposer_id,
    amount: backendProposal.amount,
    price: backendProposal.price,
    encrypted: backendProposal.encrypted || false,
    encryptedData: backendProposal.encrypted_data,
    timestamp: backendProposal.timestamp,
    status: backendProposal.status.toLowerCase() as "pending" | "accepted" | "rejected",
    settlement_status: backendProposal.settlement_status as "ready" | "alice_locked" | "bob_locked" | "both_locked" | "alice_claimed" | "strk_claimed" | "claiming" | "complete" | undefined,
    hash_lock: backendProposal.hash_lock,
  };
}

export class BlackTraceAPI {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  setToken(token: string) {
    this.token = token;
  }

  async register(username: string, password: string): Promise<User> {
    const registerResponse = await this.client.post<{
      username: string;
      status: string;
      zcash_address: string;
      private_key: string;
      pubkey: string;
      pubkey_hash: string;
    }>('/auth/register', {
      username,
      password,
    });

    // Store the keypair info in localStorage for later use (signing transactions)
    const keypairKey = `blacktrace_keypair_${username}`;
    localStorage.setItem(keypairKey, JSON.stringify({
      private_key: registerResponse.data.private_key,
      pubkey: registerResponse.data.pubkey,
      pubkey_hash: registerResponse.data.pubkey_hash,
      zcash_address: registerResponse.data.zcash_address,
    }));
    console.log(`Stored keypair for ${username} in localStorage`);

    // Login after registering
    const user = await this.login(username, password);

    // Attach keypair info to the user object
    user.zcash_address = registerResponse.data.zcash_address;
    user.private_key = registerResponse.data.private_key;
    user.pubkey = registerResponse.data.pubkey;
    user.pubkey_hash = registerResponse.data.pubkey_hash;

    return user;
  }

  async login(username: string, password: string): Promise<User> {
    const response = await this.client.post<{
      session_id: string;
      username: string;
      expires_at: string;
    }>('/auth/login', {
      username,
      password,
    });

    // Map backend response to frontend User type
    const user: User = {
      username: response.data.username,
      token: response.data.session_id,
      peerID: '', // Will be fetched from status endpoint
    };

    // Try to retrieve stored keypair from localStorage
    const keypairKey = `blacktrace_keypair_${username}`;
    const storedKeypair = localStorage.getItem(keypairKey);
    if (storedKeypair) {
      try {
        const keypair = JSON.parse(storedKeypair);
        user.private_key = keypair.private_key;
        user.pubkey = keypair.pubkey;
        user.pubkey_hash = keypair.pubkey_hash;
        user.zcash_address = keypair.zcash_address;
        console.log(`Retrieved keypair for ${username} from localStorage`);
      } catch (e) {
        console.warn('Failed to parse stored keypair:', e);
      }
    }

    this.setToken(user.token);
    return user;
  }

  async createOrder(order: {
    session_id: string;
    amount: number;
    stablecoin: string;
    min_price: number;
    max_price: number;
  }): Promise<{ order_id: string }> {
    const response = await this.client.post<{ order_id: string }>('/orders/create', order);
    return response.data;
  }

  async getOrders(): Promise<Order[]> {
    const response = await this.client.get<{ orders: Order[] }>('/orders');
    return response.data?.orders || [];
  }

  async requestOrderDetails(orderId: string): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>('/negotiate/request', {
      order_id: orderId,
    });
    return response.data;
  }

  async createProposal(proposal: {
    session_id: string;
    order_id: string;
    amount: number;
    price: number;
  }): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>('/negotiate/propose', proposal);
    return response.data;
  }

  async getProposals(): Promise<Proposal[]> {
    const response = await this.client.get<Proposal[]>('/proposals');
    return response.data || [];
  }

  async getProposalsForOrder(orderId: string): Promise<{ proposals: Proposal[] }> {
    const response = await this.client.post<{ proposals: BackendProposal[] }>('/negotiate/proposals', {
      order_id: orderId,
    });
    // Map backend proposals to frontend format
    const mappedProposals = (response.data.proposals || []).map(mapProposal);
    return { proposals: mappedProposals };
  }

  async acceptProposal(proposalId: string, secret: string): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>('/negotiate/accept', {
      proposal_id: proposalId,
      secret: secret,
    });
    return response.data;
  }

  async rejectProposal(proposalId: string): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>('/negotiate/reject', {
      proposal_id: proposalId,
    });
    return response.data;
  }

  async lockZEC(proposalId: string, secret?: string): Promise<{ status: string; settlement_status: string; hash?: string }> {
    const response = await this.client.post<{ status: string; settlement_status: string; hash?: string }>('/settlement/lock-zec', {
      proposal_id: proposalId,
      session_id: this.token, // Include session for user authentication and wallet lookup
      secret: secret, // The secret Alice creates - backend will compute hash
    });
    return response.data;
  }

  async lockUSDC(proposalId: string): Promise<{ status: string; settlement_status: string }> {
    const response = await this.client.post<{ status: string; settlement_status: string }>('/settlement/lock-usdc', {
      proposal_id: proposalId,
    });
    return response.data;
  }

  async claimZEC(proposalId: string, secret: string): Promise<{ status: string; settlement_status: string }> {
    const response = await this.client.post<{ status: string; settlement_status: string }>('/settlement/claim-zec', {
      proposal_id: proposalId,
      secret: secret,
      session_id: this.token,
    });
    return response.data;
  }

  async updateSettlementStatus(proposalId: string, settlementStatus: string): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>('/settlement/update-status', {
      proposal_id: proposalId,
      settlement_status: settlementStatus,
    });
    return response.data;
  }

  async decryptProposal(proposalID: string): Promise<Proposal> {
    const response = await this.client.post<Proposal>(`/proposals/${proposalID}/decrypt`);
    return response.data;
  }

  async getStatus() {
    const response = await this.client.get('/status');
    return response.data;
  }

  async getPeers() {
    const response = await this.client.get('/peers');
    return response.data;
  }

  async getUsers(): Promise<{ users: Array<{ username: string; created_at: string }> }> {
    const response = await this.client.get<{ users: Array<{ username: string; created_at: string }> }>('/users');
    return response.data;
  }
}

// Helper function to get stored keypair for a user
export function getStoredKeypair(username: string): {
  private_key: string;
  pubkey: string;
  pubkey_hash: string;
  zcash_address: string;
} | null {
  const keypairKey = `blacktrace_keypair_${username}`;
  const storedKeypair = localStorage.getItem(keypairKey);
  if (storedKeypair) {
    try {
      return JSON.parse(storedKeypair);
    } catch (e) {
      console.warn('Failed to parse stored keypair:', e);
      return null;
    }
  }
  return null;
}

// Create API instances for Alice and Bob
export const aliceAPI = new BlackTraceAPI('http://localhost:8080');
export const bobAPI = new BlackTraceAPI('http://localhost:8081');
