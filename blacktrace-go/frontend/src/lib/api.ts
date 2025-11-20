import axios, { type AxiosInstance } from 'axios';
import type { User, Order, Proposal } from './types';

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
    const response = await this.client.post('/auth/register', {
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
    asset: string;
    amount: number;
    price: number;
    side: string;
    stablecoin: string;
    recipient_peer_id?: string;
  }): Promise<Order> {
    const response = await this.client.post<Order>('/orders', order);
    return response.data;
  }

  async getOrders(): Promise<Order[]> {
    const response = await this.client.get<Order[]>('/orders');
    return response.data || [];
  }

  async createProposal(proposal: {
    order_id: string;
    amount: number;
    price: number;
  }): Promise<Proposal> {
    const response = await this.client.post<Proposal>('/proposals', proposal);
    return response.data;
  }

  async getProposals(): Promise<Proposal[]> {
    const response = await this.client.get<Proposal[]>('/proposals');
    return response.data || [];
  }

  async acceptProposal(proposalID: string): Promise<void> {
    await this.client.post(`/proposals/${proposalID}/accept`);
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
}

// Create API instances for Alice and Bob
export const aliceAPI = new BlackTraceAPI('http://localhost:8080');
export const bobAPI = new BlackTraceAPI('http://localhost:8081');
