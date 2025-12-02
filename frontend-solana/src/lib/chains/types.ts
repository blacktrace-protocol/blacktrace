/**
 * Chain Abstraction Layer for BlackTrace
 *
 * This module provides a common interface for different blockchain integrations.
 * Each chain (Starknet, Solana, etc.) implements this interface, allowing the
 * settlement components to work with any supported chain.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';

/**
 * HTLC (Hash Time-Locked Contract) details
 * Common structure across all chains
 */
export interface HTLCDetails {
  /** SHA256 or chain-specific hash of the secret */
  hash_lock: string;
  /** Address of the sender who locked funds */
  sender: string;
  /** Address of the receiver who can claim with secret */
  receiver: string;
  /** Amount locked (in smallest unit, e.g., lamports, wei) */
  amount: bigint;
  /** Unix timestamp after which sender can refund */
  timeout: number;
  /** Whether funds have been claimed */
  claimed: boolean;
  /** Whether funds have been refunded */
  refunded: boolean;
}

/**
 * Chain provider context interface
 * All chain providers must implement this interface
 */
export interface ChainContextType {
  /** Connected account/wallet (chain-specific type) */
  account: unknown | null;
  /** Connected wallet address */
  address: string | null;
  /** Current role (maker/taker) */
  role: 'bob' | 'alice' | null;
  /** Token balance (formatted string) */
  balance: string | null;
  /** Chain identifier */
  chainId: string;
  /** Token symbol (e.g., 'STRK', 'SOL', 'USDC') */
  tokenSymbol: string;

  /** Connect wallet for the given role */
  connectWallet: (role: 'bob' | 'alice') => Promise<void>;
  /** Disconnect wallet */
  disconnectWallet: () => void;
  /** Get HTLC details by hash lock */
  getHTLCDetails: (hashLock: string) => Promise<HTLCDetails | null>;
  /** Get token balance for an address */
  getBalance: (address: string) => Promise<string>;
  /** Lock funds with a new secret (generates hash) */
  lockFunds: (secret: string, receiver: string, amount: string, timeoutMinutes: number) => Promise<string>;
  /** Lock funds with a pre-computed hash (for cross-chain swaps) */
  lockFundsWithHash: (hashLock: string, receiver: string, amount: string, timeoutMinutes: number) => Promise<string>;
  /** Claim funds by revealing the secret */
  claimFunds: (hashLock: string, secret: string, amount?: number) => Promise<string>;
  /** Refresh the current balance */
  refreshBalance: () => Promise<void>;
}

/**
 * Supported chains
 */
export const SupportedChain = {
  STARKNET: 'starknet',
  SOLANA: 'solana',
} as const;

export type SupportedChain = typeof SupportedChain[keyof typeof SupportedChain];

/**
 * Chain configuration
 */
export interface ChainConfig {
  /** Chain identifier */
  chainId: string;
  /** Display name */
  name: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Token decimals */
  tokenDecimals: number;
  /** RPC URL */
  rpcUrl: string;
  /** HTLC contract/program address */
  htlcAddress: string;
  /** Token contract address (for SPL/ERC20) */
  tokenAddress: string;
  /** Whether this is a devnet/testnet */
  isDevnet: boolean;
}

/**
 * Get default chain configurations
 */
export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  [SupportedChain.STARKNET]: {
    chainId: 'starknet',
    name: 'Starknet',
    tokenSymbol: 'STRK',
    tokenDecimals: 18,
    rpcUrl: 'http://127.0.0.1:5050/rpc',
    htlcAddress: '0x03ec27bbe255f7c4031a0052e1e2cb6aac113a5ddb9a77231ded08573f99e290',
    tokenAddress: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    isDevnet: true,
  },
  [SupportedChain.SOLANA]: {
    chainId: 'solana',
    name: 'Solana',
    tokenSymbol: 'SOL',
    tokenDecimals: 9,  // SOL has 9 decimals (lamports)
    rpcUrl: 'http://127.0.0.1:8899',
    htlcAddress: 'CUxqXa849pvw3TLEWRrA2RyA3vm5SXXwb181BFnRSvej', // Deployed HTLC program ID
    tokenAddress: 'native',  // Native SOL, not SPL token
    isDevnet: true,
  },
};

/**
 * Hash utilities for cross-chain compatibility
 */
export const HashUtils = {
  /**
   * Convert a hex string to Uint8Array
   */
  hexToBytes: (hex: string): Uint8Array => {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    return bytes;
  },

  /**
   * Convert Uint8Array to hex string
   */
  bytesToHex: (bytes: Uint8Array): string => {
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Compute SHA256 hash
   */
  sha256: async (data: Uint8Array): Promise<Uint8Array> => {
    return sha256(data);
  },

  /**
   * Compute RIPEMD160 hash
   */
  ripemd160: (data: Uint8Array): Uint8Array => {
    return ripemd160(data);
  },

  /**
   * Compute HASH160 = RIPEMD160(SHA256(data))
   * This is the Bitcoin/Zcash standard, produces 20 bytes
   */
  hash160: (data: Uint8Array): Uint8Array => {
    const sha256Hash = sha256(data);
    return ripemd160(sha256Hash);
  },

  /**
   * Compute hash lock from secret using HASH160
   * HASH160 = RIPEMD160(SHA256(secret)) - compatible with Zcash HTLC scripts
   * Returns a 20-byte (40 hex char) hash
   */
  computeHashLock: async (secret: string): Promise<string> => {
    const encoder = new TextEncoder();
    const secretBytes = encoder.encode(secret);
    const hashBytes = HashUtils.hash160(secretBytes);
    return HashUtils.bytesToHex(hashBytes);
  },
};
