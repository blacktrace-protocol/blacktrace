/**
 * Solana Chain Provider for BlackTrace
 *
 * Implements the chain abstraction interface for Solana using native SOL.
 * Uses SHA256 for HTLC hash locks (compatible with Zcash).
 *
 * Supports two modes:
 * - DEMO_MODE: Direct SOL transfers (simulates HTLC for quick testing)
 * - HTLC_MODE: Uses the deployed HTLC smart contract for real atomic swaps
 */

import React, { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { type ChainContextType, type HTLCDetails, CHAIN_CONFIGS, SupportedChain, HashUtils } from './types';
import { HTLCClient } from './htlc_client';
import { HTLC_PROGRAM_ID } from './htlc_idl';

// Configuration: Set to false to use real HTLC contract
const DEMO_MODE = true;

// Solana Configuration
const SOLANA_CONFIG = CHAIN_CONFIGS[SupportedChain.SOLANA];
const DEVNET_RPC_URL = SOLANA_CONFIG.rpcUrl;

// Devnet pre-funded accounts (for demo purposes)
// These keypairs are deterministic for reproducibility
const DEVNET_ACCOUNTS = {
  bob: {
    // Generated keypair for Bob
    secretKey: new Uint8Array([
      174, 47, 154, 16, 202, 193, 206, 113, 199, 190, 53, 133, 169, 175, 31, 56,
      222, 53, 138, 189, 224, 216, 117, 173, 10, 149, 53, 45, 73, 251, 237, 246,
      15, 185, 186, 82, 177, 240, 148, 69, 241, 227, 167, 80, 141, 89, 240, 121,
      121, 35, 172, 247, 68, 251, 226, 218, 48, 63, 176, 109, 168, 89, 238, 135,
    ]),
  },
  alice: {
    // Generated keypair for Alice
    secretKey: new Uint8Array([
      62, 168, 83, 230, 117, 45, 169, 205, 47, 148, 220, 91, 55, 211, 192, 138,
      55, 209, 134, 236, 174, 156, 197, 78, 224, 85, 236, 58, 85, 145, 75, 171,
      245, 89, 180, 28, 35, 201, 167, 82, 167, 110, 28, 171, 173, 98, 228, 165,
      158, 178, 57, 156, 219, 181, 85, 113, 201, 158, 70, 81, 147, 243, 236, 51,
    ]),
  },
};

// Extend ChainContextType with Solana-specific properties
interface SolanaContextType extends ChainContextType {
  connection: Connection;
  keypair: Keypair | null;
  htlcClient: HTLCClient | null;
  htlcProgramId: string;
  demoMode: boolean;
}

const MakerSolanaContext = createContext<SolanaContextType | undefined>(undefined);
const TakerSolanaContext = createContext<SolanaContextType | undefined>(undefined);

/**
 * Create a Solana provider component
 */
const createSolanaProvider = (
  Context: React.Context<SolanaContextType | undefined>,
  providerName: string
) => {
  const SolanaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [keypair, setKeypair] = useState<Keypair | null>(null);
    const [address, setAddress] = useState<string | null>(null);
    const [role, setRole] = useState<'bob' | 'alice' | null>(null);
    const [balance, setBalance] = useState<string | null>(null);
    const connection = useMemo(() => new Connection(DEVNET_RPC_URL, 'confirmed'), []);

    // Create HTLC client
    const htlcClient = useMemo(() => new HTLCClient(connection), [connection]);

    /**
     * Get SOL balance for an address
     */
    const getBalance = async (accountAddress: string): Promise<string> => {
      try {
        const pubkey = new PublicKey(accountAddress);
        const solBalance = await connection.getBalance(pubkey);
        const solAmount = solBalance / LAMPORTS_PER_SOL;
        return solAmount.toFixed(4);
      } catch (error) {
        console.error('Failed to get balance:', error);
        return '0.0000';
      }
    };

    /**
     * Connect wallet for the given role
     */
    const connectWallet = async (selectedRole: 'bob' | 'alice') => {
      try {
        const accountConfig = DEVNET_ACCOUNTS[selectedRole];
        const kp = Keypair.fromSecretKey(accountConfig.secretKey);

        setKeypair(kp);
        setAddress(kp.publicKey.toBase58());
        setRole(selectedRole);

        console.log(`[${providerName}] Connected as ${selectedRole}:`, kp.publicKey.toBase58());

        // Request airdrop if balance is low (local validator)
        try {
          const solBalance = await connection.getBalance(kp.publicKey);
          if (solBalance < 2 * LAMPORTS_PER_SOL) {
            console.log(`[${providerName}] Requesting airdrop...`);
            const signature = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
            await connection.confirmTransaction(signature);
            console.log(`[${providerName}] Airdrop complete`);
          }
        } catch (airdropError) {
          console.log(`[${providerName}] Airdrop failed (validator may not be running):`, airdropError);
        }

        // Fetch balance after airdrop attempt
        const bal = await getBalance(kp.publicKey.toBase58());
        setBalance(bal);
        console.log(`[${providerName}] Balance:`, bal, 'SOL');
      } catch (error) {
        console.error(`[${providerName}] Failed to connect wallet:`, error);
        throw error;
      }
    };

    /**
     * Disconnect wallet
     */
    const disconnectWallet = () => {
      setKeypair(null);
      setAddress(null);
      setRole(null);
      setBalance(null);
    };

    /**
     * Get HTLC details by hash lock
     * Note: In demo mode, this returns null as we use direct transfers
     */
    const getHTLCDetails = async (hashLock: string): Promise<HTLCDetails | null> => {
      // In full implementation, this would query the HTLC program
      // For demo mode with direct transfers, return null
      console.log(`[${providerName}] getHTLCDetails called for:`, hashLock);
      return null;
    };

    /**
     * Lock funds with a new secret (generates hash)
     */
    const lockFunds = async (
      secret: string,
      receiver: string,
      amount: string,
      timeoutMinutes: number
    ): Promise<string> => {
      if (!keypair) throw new Error('Wallet not connected');

      try {
        // Compute hash lock from secret (SHA256)
        const hashLock = await HashUtils.computeHashLock(secret);
        return await lockFundsWithHash(hashLock, receiver, amount, timeoutMinutes);
      } catch (error) {
        console.error(`[${providerName}] Failed to lock funds:`, error);
        throw error;
      }
    };

    /**
     * Lock funds with a pre-computed hash (for cross-chain swaps)
     * This is used when Bob locks SOL using the hash from Alice's Zcash HTLC
     *
     * DEMO MODE: Direct SOL transfer (simulates HTLC lock)
     * HTLC MODE: Calls the deployed HTLC program's lock instruction
     */
    const lockFundsWithHash = async (
      hashLock: string,
      receiver: string,
      amount: string,
      timeoutMinutes: number
    ): Promise<string> => {
      if (!keypair) throw new Error('Wallet not connected');

      try {
        // Amount is in lamports (1 SOL = 1e9 lamports)
        const amountLamports = BigInt(amount);
        const timeoutSeconds = timeoutMinutes * 60;

        console.log(`[${providerName}] Locking SOL with hash:`, {
          hashLock,
          receiver,
          amountLamports: amountLamports.toString(),
          amountSOL: (Number(amountLamports) / LAMPORTS_PER_SOL).toFixed(4),
          timeoutMinutes,
          mode: DEMO_MODE ? 'DEMO' : 'HTLC',
        });

        let signature: string;

        if (DEMO_MODE) {
          // DEMO MODE: Direct SOL transfer to receiver
          console.log(`[${providerName}] DEMO MODE: Transferring SOL directly (simulating HTLC lock)`);
          const receiverPubkey = new PublicKey(receiver);

          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey: receiverPubkey,
              lamports: amountLamports,
            })
          );

          signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
          console.log(`[${providerName}] SOL transfer complete:`, signature);
        } else {
          // HTLC MODE: Lock SOL in HTLC contract
          console.log(`[${providerName}] HTLC MODE: Locking SOL in HTLC contract`);
          signature = await htlcClient.lockSOLDirect(
            keypair,
            hashLock,
            receiver,
            amountLamports,
            timeoutSeconds
          );
          console.log(`[${providerName}] SOL locked in HTLC:`, signature);
        }

        // Refresh balance
        if (address) {
          const newBalance = await getBalance(address);
          setBalance(newBalance);
        }

        return signature;
      } catch (error) {
        console.error(`[${providerName}] Failed to lock SOL:`, error);
        throw error;
      }
    };

    /**
     * Claim funds by revealing the secret
     *
     * DEMO MODE: Funds already transferred during lock step, just verify secret
     * HTLC MODE: Calls the HTLC program's claim instruction to release funds
     */
    const claimFunds = async (hashLock: string, secret: string, amount?: number): Promise<string> => {
      if (!keypair) throw new Error('Wallet not connected');

      try {
        console.log(`[${providerName}] CLAIM: Verifying secret`);
        console.log('  Hash lock:', hashLock);
        console.log('  Secret:', secret);
        console.log('  Mode:', DEMO_MODE ? 'DEMO' : 'HTLC');
        if (amount) console.log('  Amount:', amount, 'SOL');

        // Verify the secret matches the hash
        const computedHash = await HashUtils.computeHashLock(secret);
        const normalizedHashLock = hashLock.startsWith('0x') ? hashLock.slice(2) : hashLock;
        const normalizedComputed = computedHash.startsWith('0x') ? computedHash.slice(2) : computedHash;

        if (normalizedComputed.toLowerCase() !== normalizedHashLock.toLowerCase()) {
          console.warn(`[${providerName}] WARNING: Secret does not match hash lock`);
          console.warn('  Expected:', normalizedHashLock);
          console.warn('  Computed:', normalizedComputed);
          throw new Error('Invalid secret: SHA256(secret) does not match hash_lock');
        }

        console.log(`[${providerName}] Secret verification PASSED`);

        let signature: string;

        if (DEMO_MODE) {
          // In demo mode, funds were already transferred, return a mock signature
          signature = Array.from({ length: 88 }, () =>
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
              Math.floor(Math.random() * 62)
            ]
          ).join('');
          console.log(`[${providerName}] DEMO MODE: Claim simulated`);
        } else {
          // HTLC MODE: Call the HTLC program to claim
          console.log(`[${providerName}] HTLC MODE: Claiming from HTLC contract`);
          const amountLamports = amount ? BigInt(Math.floor(amount * LAMPORTS_PER_SOL)) : BigInt(0);
          signature = await htlcClient.claimSOLDirect(
            keypair,
            hashLock,
            secret,
            amountLamports
          );
          console.log(`[${providerName}] HTLC claim complete:`, signature);
        }

        // Refresh balance
        if (address) {
          const newBalance = await getBalance(address);
          setBalance(newBalance);
        }

        console.log(`[${providerName}] Claim complete:`, signature);
        return signature;
      } catch (error) {
        console.error(`[${providerName}] Failed to claim:`, error);
        throw error;
      }
    };

    /**
     * Refresh the current balance
     */
    const refreshBalance = async () => {
      if (address) {
        const newBalance = await getBalance(address);
        setBalance(newBalance);
      }
    };

    return (
      <Context.Provider
        value={{
          account: keypair,
          keypair,
          address,
          role,
          balance,
          chainId: SOLANA_CONFIG.chainId,
          tokenSymbol: SOLANA_CONFIG.tokenSymbol,
          connection,
          htlcClient,
          htlcProgramId: HTLC_PROGRAM_ID,
          demoMode: DEMO_MODE,
          connectWallet,
          disconnectWallet,
          getHTLCDetails,
          getBalance,
          lockFunds,
          lockFundsWithHash,
          claimFunds,
          refreshBalance,
        }}
      >
        {children}
      </Context.Provider>
    );
  };

  return SolanaProvider;
};

// Create Maker and Taker providers
export const MakerSolanaProvider = createSolanaProvider(MakerSolanaContext, 'MakerSolana');
export const TakerSolanaProvider = createSolanaProvider(TakerSolanaContext, 'TakerSolana');

// Hooks for each context
export const useMakerSolana = (): SolanaContextType => {
  const context = useContext(MakerSolanaContext);
  if (context === undefined) {
    throw new Error('useMakerSolana must be used within a MakerSolanaProvider');
  }
  return context;
};

export const useTakerSolana = (): SolanaContextType => {
  const context = useContext(TakerSolanaContext);
  if (context === undefined) {
    throw new Error('useTakerSolana must be used within a TakerSolanaProvider');
  }
  return context;
};

// Backward compatibility aliases
export const useSolana = useTakerSolana;
export const SolanaProvider = TakerSolanaProvider;
