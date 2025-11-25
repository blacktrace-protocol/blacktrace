import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { Account, RpcProvider, Contract, cairo, CallData, hash } from 'starknet';
import HTLC_ABI from './htlc-abi.json';

// HTLC Contract Configuration
const HTLC_CONTRACT_ADDRESS = '0x8d55e048d8d4a7b8242a6f9543e8864679f00741cf8020e0aed9fc16ac9fc7';
const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';

// Devnet pre-deployed accounts (for demo purposes)
const DEVNET_ACCOUNTS = {
  bob: {
    address: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
    privateKey: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
  },
  alice: {
    address: '0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1',
    privateKey: '0x000000000000000000000000000000000e1406455b7d66b1690803be066cbe5e',
  },
};

export interface HTLCDetails {
  hash_lock: string;
  sender: string;
  receiver: string;
  amount: bigint;
  timeout: number;
  claimed: boolean;
  refunded: boolean;
}

interface StarknetContextType {
  account: Account | null;
  address: string | null;
  role: 'bob' | 'alice' | null;
  balance: string | null;
  connectWallet: (role: 'bob' | 'alice') => Promise<void>;
  disconnectWallet: () => void;
  getHTLCDetails: () => Promise<HTLCDetails | null>;
  getBalance: (address: string) => Promise<string>;
  lockFunds: (secret: string, receiver: string, amount: string, timeoutMinutes: number) => Promise<string>;
  claimFunds: (secret: string) => Promise<string>;
  provider: RpcProvider;
}

const MakerStarknetContext = createContext<StarknetContextType | undefined>(undefined);
const TakerStarknetContext = createContext<StarknetContextType | undefined>(undefined);

// STRK Token on devnet (fee token)
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

// Maker (Alice) Provider
export const MakerStarknetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<'bob' | 'alice' | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  const getBalance = async (accountAddress: string): Promise<string> => {
    try {
      // Use provider.callContract directly to avoid ABI issues
      const result = await provider.callContract({
        contractAddress: STRK_TOKEN_ADDRESS,
        entrypoint: 'balanceOf',
        calldata: CallData.compile({
          account: accountAddress,
        }),
      });

      // Parse the result - balanceOf returns u256 (two felts: low, high)
      if (result && result.length >= 2) {
        const low = BigInt(result[0] || '0');
        const high = BigInt(result[1] || '0');
        const balanceBigInt = low + (high << 128n);

        // Convert from wei (18 decimals) to STRK
        const strkBalance = Number(balanceBigInt) / 1e18;
        return strkBalance.toFixed(4);
      }

      return '0.0000';
    } catch (error) {
      console.error('Failed to get balance:', error);
      return '0.0000';
    }
  };

  const connectWallet = async (selectedRole: 'bob' | 'alice') => {
    try {
      const accountConfig = DEVNET_ACCOUNTS[selectedRole];
      const devnetAccount = new Account({
        provider,
        address: accountConfig.address,
        signer: accountConfig.privateKey,
      });

      setAccount(devnetAccount);
      setAddress(accountConfig.address);
      setRole(selectedRole);

      // Fetch initial balance
      const bal = await getBalance(accountConfig.address);
      setBalance(bal);

      console.log(`Connected as ${selectedRole}:`, accountConfig.address);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setAddress(null);
    setRole(null);
    setBalance(null);
  };

  const getHTLCDetails = async (): Promise<HTLCDetails | null> => {
    try {
      const contract = new Contract({
        abi: HTLC_ABI,
        address: HTLC_CONTRACT_ADDRESS,
        providerOrAccount: provider,
      });
      const result = await contract.get_htlc_details();

      // Handle different response structures from starknet.js
      let htlcData = result;

      // If result has HTLCDetails property, unwrap it
      if (result && typeof result === 'object' && 'HTLCDetails' in result) {
        htlcData = result.HTLCDetails;
      }

      // If htlcData is still an object with the expected fields, parse it
      if (htlcData && typeof htlcData === 'object' && 'hash_lock' in htlcData) {
        const amountValue = htlcData.amount;
        let amountBigInt = 0n;

        // Parse amount - could be u256 struct {low, high} or direct bigint
        if (amountValue && typeof amountValue === 'object' && 'low' in amountValue) {
          const low = BigInt(amountValue.low?.toString() || '0');
          const high = BigInt(amountValue.high?.toString() || '0');
          amountBigInt = low + (high << 128n);
        } else if (amountValue) {
          amountBigInt = BigInt(amountValue.toString());
        }

        return {
          hash_lock: htlcData.hash_lock?.toString() || '0x0',
          sender: htlcData.sender?.toString() || '0x0',
          receiver: htlcData.receiver?.toString() || '0x0',
          amount: amountBigInt,
          timeout: Number(htlcData.timeout || 0),
          claimed: Boolean(htlcData.claimed),
          refunded: Boolean(htlcData.refunded),
        };
      }

      // Return empty state if no valid data
      return {
        hash_lock: '0x0',
        sender: '0x0',
        receiver: '0x0',
        amount: 0n,
        timeout: 0,
        claimed: false,
        refunded: false,
      };
    } catch (error) {
      console.error('Failed to get HTLC details:', error);
      return null;
    }
  };

  const computePedersenHash = (secret: string): string => {
    // Convert secret to felt
    const secretFelt = cairo.felt(secret);
    // Compute Pedersen hash (secret, 0) to match Cairo contract
    // Use starknet.js's computePedersenHash instead of @scure/starknet
    const hashValue = hash.computePedersenHash(secretFelt, '0');
    return hashValue;
  };

  const lockFunds = async (
    secret: string,
    receiver: string,
    amount: string,
    timeoutMinutes: number
  ): Promise<string> => {
    if (!account) throw new Error('Wallet not connected');

    try {
      // Compute hash of secret
      const hashLock = computePedersenHash(secret);

      // Calculate timeout (current time + minutes)
      const timeout = Math.floor(Date.now() / 1000) + (timeoutMinutes * 60);

      // Convert amount to u256 (low, high)
      const amountBigInt = BigInt(amount);
      const amountLow = amountBigInt & ((1n << 128n) - 1n);
      const amountHigh = amountBigInt >> 128n;

      console.log('Locking funds:', {
        hashLock,
        receiver,
        timeout,
        amount: amountBigInt.toString(),
        amountLow: amountLow.toString(),
        amountHigh: amountHigh.toString(),
      });

      // Step 1: Approve HTLC contract to spend STRK tokens
      console.log('Approving HTLC contract to spend STRK...');
      const approveTx = await account.execute({
        contractAddress: STRK_TOKEN_ADDRESS,
        entrypoint: 'approve',
        calldata: CallData.compile({
          spender: HTLC_CONTRACT_ADDRESS,
          amount: { low: amountLow, high: amountHigh },
        }),
      });
      await provider.waitForTransaction(approveTx.transaction_hash);
      console.log('Approval transaction:', approveTx.transaction_hash);

      // Step 2: Lock funds in HTLC
      // Use CallData to properly encode parameters
      // u256 in Cairo is represented as { low: felt252, high: felt252 }
      const calldata = CallData.compile({
        hash_lock: hashLock,
        receiver: receiver,
        timeout: timeout,
        amount: { low: amountLow, high: amountHigh },
      });

      // Invoke using account.execute
      const tx = await account.execute({
        contractAddress: HTLC_CONTRACT_ADDRESS,
        entrypoint: 'lock',
        calldata: calldata,
      });
      await provider.waitForTransaction(tx.transaction_hash);

      // Refresh balance after transaction
      if (address) {
        const newBalance = await getBalance(address);
        setBalance(newBalance);
      }

      console.log('Lock transaction:', tx.transaction_hash);
      return tx.transaction_hash;
    } catch (error) {
      console.error('Failed to lock funds:', error);
      throw error;
    }
  };

  const claimFunds = async (secret: string): Promise<string> => {
    if (!account) throw new Error('Wallet not connected');

    try {
      const secretFelt = cairo.felt(secret);

      console.log('Claiming funds with secret:', secretFelt);

      // Use CallData to properly encode parameters
      const calldata = CallData.compile({
        secret: secretFelt,
      });

      // Invoke using account.execute
      const tx = await account.execute({
        contractAddress: HTLC_CONTRACT_ADDRESS,
        entrypoint: 'claim',
        calldata: calldata,
      });
      await provider.waitForTransaction(tx.transaction_hash);

      // Refresh balance after transaction
      if (address) {
        const newBalance = await getBalance(address);
        setBalance(newBalance);
      }

      console.log('Claim transaction:', tx.transaction_hash);
      return tx.transaction_hash;
    } catch (error) {
      console.error('Failed to claim funds:', error);
      throw error;
    }
  };

  return (
    <MakerStarknetContext.Provider
      value={{
        account,
        address,
        role,
        balance,
        connectWallet,
        disconnectWallet,
        getHTLCDetails,
        getBalance,
        lockFunds,
        claimFunds,
        provider,
      }}
    >
      {children}
    </MakerStarknetContext.Provider>
  );
};

// Taker (Bob) Provider - same implementation but separate context
export const TakerStarknetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<'bob' | 'alice' | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  // Copy all the functions from above (getBalance, connectWallet, etc.)
  const getBalance = async (accountAddress: string): Promise<string> => {
    try {
      const result = await provider.callContract({
        contractAddress: STRK_TOKEN_ADDRESS,
        entrypoint: 'balanceOf',
        calldata: CallData.compile({ account: accountAddress }),
      });

      if (result && result.length >= 2) {
        const low = BigInt(result[0] || '0');
        const high = BigInt(result[1] || '0');
        const balanceBigInt = low + (high << 128n);
        const strkBalance = Number(balanceBigInt) / 1e18;
        return strkBalance.toFixed(4);
      }
      return '0.0000';
    } catch (error) {
      console.error('Failed to get balance:', error);
      return '0.0000';
    }
  };

  const connectWallet = async (selectedRole: 'bob' | 'alice') => {
    try {
      const accountConfig = DEVNET_ACCOUNTS[selectedRole];
      const devnetAccount = new Account({
        provider,
        address: accountConfig.address,
        signer: accountConfig.privateKey,
      });

      setAccount(devnetAccount);
      setAddress(accountConfig.address);
      setRole(selectedRole);

      const bal = await getBalance(accountConfig.address);
      setBalance(bal);

      console.log(`Connected as ${selectedRole}:`, accountConfig.address);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setAddress(null);
    setRole(null);
    setBalance(null);
  };

  const getHTLCDetails = async (): Promise<HTLCDetails | null> => {
    try {
      const contract = new Contract({
        abi: HTLC_ABI,
        address: HTLC_CONTRACT_ADDRESS,
        providerOrAccount: provider,
      });
      const result = await contract.get_htlc_details();

      let htlcData = result;
      if (result && typeof result === 'object' && 'HTLCDetails' in result) {
        htlcData = result.HTLCDetails;
      }

      if (htlcData && typeof htlcData === 'object' && 'hash_lock' in htlcData) {
        const amountValue = htlcData.amount;
        let amountBigInt = 0n;

        if (amountValue && typeof amountValue === 'object' && 'low' in amountValue) {
          const low = BigInt(amountValue.low?.toString() || '0');
          const high = BigInt(amountValue.high?.toString() || '0');
          amountBigInt = low + (high << 128n);
        } else if (amountValue) {
          amountBigInt = BigInt(amountValue.toString());
        }

        return {
          hash_lock: htlcData.hash_lock?.toString() || '0x0',
          sender: htlcData.sender?.toString() || '0x0',
          receiver: htlcData.receiver?.toString() || '0x0',
          amount: amountBigInt,
          timeout: Number(htlcData.timeout || 0),
          claimed: Boolean(htlcData.claimed),
          refunded: Boolean(htlcData.refunded),
        };
      }

      return {
        hash_lock: '0x0',
        sender: '0x0',
        receiver: '0x0',
        amount: 0n,
        timeout: 0,
        claimed: false,
        refunded: false,
      };
    } catch (error) {
      console.error('Failed to get HTLC details:', error);
      return null;
    }
  };

  const computePedersenHash = (secret: string): string => {
    const secretFelt = cairo.felt(secret);
    // Use starknet.js's computePedersenHash instead of @scure/starknet
    const hashValue = hash.computePedersenHash(secretFelt, '0');
    return hashValue;
  };

  const lockFunds = async (
    secret: string,
    receiver: string,
    amount: string,
    timeoutMinutes: number
  ): Promise<string> => {
    if (!account) throw new Error('Wallet not connected');

    try {
      const hashLock = computePedersenHash(secret);
      const timeout = Math.floor(Date.now() / 1000) + (timeoutMinutes * 60);
      const amountBigInt = BigInt(amount);
      const amountLow = amountBigInt & ((1n << 128n) - 1n);
      const amountHigh = amountBigInt >> 128n;

      console.log('Locking funds:', {
        hashLock,
        receiver,
        timeout,
        amount: amountBigInt.toString(),
        amountLow: amountLow.toString(),
        amountHigh: amountHigh.toString(),
      });

      // Step 1: Approve HTLC contract to spend STRK tokens
      console.log('Approving HTLC contract to spend STRK...');
      const approveTx = await account.execute({
        contractAddress: STRK_TOKEN_ADDRESS,
        entrypoint: 'approve',
        calldata: CallData.compile({
          spender: HTLC_CONTRACT_ADDRESS,
          amount: { low: amountLow, high: amountHigh },
        }),
      });
      await provider.waitForTransaction(approveTx.transaction_hash);
      console.log('Approval transaction:', approveTx.transaction_hash);

      // Step 2: Lock funds in HTLC
      const calldata = CallData.compile({
        hash_lock: hashLock,
        receiver: receiver,
        timeout: timeout,
        amount: { low: amountLow, high: amountHigh },
      });

      const tx = await account.execute({
        contractAddress: HTLC_CONTRACT_ADDRESS,
        entrypoint: 'lock',
        calldata: calldata,
      });
      await provider.waitForTransaction(tx.transaction_hash);

      if (address) {
        const newBalance = await getBalance(address);
        setBalance(newBalance);
      }

      console.log('Lock transaction:', tx.transaction_hash);
      return tx.transaction_hash;
    } catch (error) {
      console.error('Failed to lock funds:', error);
      throw error;
    }
  };

  const claimFunds = async (secret: string): Promise<string> => {
    if (!account) throw new Error('Wallet not connected');

    try {
      const secretFelt = cairo.felt(secret);

      console.log('Claiming funds with secret:', secretFelt);

      const calldata = CallData.compile({
        secret: secretFelt,
      });

      const tx = await account.execute({
        contractAddress: HTLC_CONTRACT_ADDRESS,
        entrypoint: 'claim',
        calldata: calldata,
      });
      await provider.waitForTransaction(tx.transaction_hash);

      if (address) {
        const newBalance = await getBalance(address);
        setBalance(newBalance);
      }

      console.log('Claim transaction:', tx.transaction_hash);
      return tx.transaction_hash;
    } catch (error) {
      console.error('Failed to claim funds:', error);
      throw error;
    }
  };

  return (
    <TakerStarknetContext.Provider
      value={{
        account,
        address,
        role,
        balance,
        connectWallet,
        disconnectWallet,
        getHTLCDetails,
        getBalance,
        lockFunds,
        claimFunds,
        provider,
      }}
    >
      {children}
    </TakerStarknetContext.Provider>
  );
};

// Hooks for each context
export const useMakerStarknet = () => {
  const context = useContext(MakerStarknetContext);
  if (context === undefined) {
    throw new Error('useMakerStarknet must be used within a MakerStarknetProvider');
  }
  return context;
};

export const useTakerStarknet = () => {
  const context = useContext(TakerStarknetContext);
  if (context === undefined) {
    throw new Error('useTakerStarknet must be used within a TakerStarknetProvider');
  }
  return context;
};

// Backward compatibility
export const useStarknet = useTakerStarknet;
export const StarknetProvider = TakerStarknetProvider;
