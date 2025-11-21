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
    await this.client.post('/auth/register', {
      username,
      password,
    });
    // Backend returns { username, status }, we need to login after registering
    return this.login(username, password);
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

  async acceptProposal(proposalId: string): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>('/negotiate/accept', {
      proposal_id: proposalId,
    });
    return response.data;
  }

  async rejectProposal(proposalId: string): Promise<{ status: string }> {
    const response = await this.client.post<{ status: string }>('/negotiate/reject', {
      proposal_id: proposalId,
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

// Create API instances for Alice and Bob
export const aliceAPI = new BlackTraceAPI('http://localhost:8080');
export const bobAPI = new BlackTraceAPI('http://localhost:8081');
