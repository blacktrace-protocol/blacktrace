import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { Account, RpcProvider, cairo, CallData, hash } from 'starknet';

// HTLC Contract Configuration (multi-HTLC version)
const HTLC_CONTRACT_ADDRESS = '0x03ec27bbe255f7c4031a0052e1e2cb6aac113a5ddb9a77231ded08573f99e290';
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
  getHTLCDetails: (hashLock: string) => Promise<HTLCDetails | null>;
  getBalance: (address: string) => Promise<string>;
  lockFunds: (secret: string, receiver: string, amount: string, timeoutMinutes: number) => Promise<string>;
  lockFundsWithHash: (hashLock: string, receiver: string, amount: string, timeoutMinutes: number) => Promise<string>;
  claimFunds: (hashLock: string, secret: string, amountSTRK?: number) => Promise<string>;
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
      const devnetAccount = new Account(
        provider,
        accountConfig.address,
        accountConfig.privateKey
      );

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

  const getHTLCDetails = async (hashLock: string): Promise<HTLCDetails | null> => {
    try {
      // Convert hash_lock to proper felt format
      const hashLockHex = hashLock.startsWith('0x') ? hashLock : `0x${hashLock}`;
      const hashLockFelt = BigInt(hashLockHex);

      // Call contract with hash_lock parameter using raw calldata
      const result = await provider.callContract({
        contractAddress: HTLC_CONTRACT_ADDRESS,
        entrypoint: 'get_htlc_details',
        calldata: [hashLockFelt.toString()],
      });

      // Parse the response - returned as array of felts
      // Order: hash_lock, sender, receiver, amount.low, amount.high, timeout, claimed, refunded
      if (result && result.length >= 8) {
        const amountLow = BigInt(result[3] || '0');
        const amountHigh = BigInt(result[4] || '0');
        const amountBigInt = amountLow + (amountHigh << 128n);

        return {
          hash_lock: result[0]?.toString() || '0x0',
          sender: result[1]?.toString() || '0x0',
          receiver: result[2]?.toString() || '0x0',
          amount: amountBigInt,
          timeout: Number(result[5] || 0),
          claimed: result[6] === '0x1' || result[6] === '1',
          refunded: result[7] === '0x1' || result[7] === '1',
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

  // Lock funds with a pre-computed hash (for interface consistency)
  const lockFundsWithHash = async (
    hashLock: string,
    receiver: string,
    amount: string,
    timeoutMinutes: number
  ): Promise<string> => {
    if (!account) throw new Error('Wallet not connected');

    try {
      const timeout = Math.floor(Date.now() / 1000) + (timeoutMinutes * 60);
      const amountBigInt = BigInt(amount);
      const amountLow = amountBigInt & ((1n << 128n) - 1n);
      const amountHigh = amountBigInt >> 128n;

      // Convert hash_lock hex string to BigInt for felt252
      // DO NOT use CallData.compile() - it will encode the hash as a shortstring (multi-felt)
      // Instead, pass raw felts directly to execute()
      const hashLockHex = hashLock.startsWith('0x') ? hashLock : `0x${hashLock}`;
      const hashLockFelt = BigInt(hashLockHex);

      console.log('lockFundsWithHash:', {
        hashLock: hashLockHex,
        hashLockFelt: hashLockFelt.toString(),
        receiver,
        timeout,
        amountLow: amountLow.toString(),
        amountHigh: amountHigh.toString(),
      });

      // Step 1: Approve HTLC contract to spend STRK tokens
      // Approve still uses CallData.compile since it doesn't have the hash issue
      const approveTx = await account.execute({
        contractAddress: STRK_TOKEN_ADDRESS,
        entrypoint: 'approve',
        calldata: CallData.compile({
          spender: HTLC_CONTRACT_ADDRESS,
          amount: { low: amountLow, high: amountHigh },
        }),
      });
      await provider.waitForTransaction(approveTx.transaction_hash);

      // Step 2: Lock funds in HTLC with the provided hash
      // DO NOT use CallData.compile() - pass raw calldata array directly
      // This prevents starknet.js from encoding the hash as a shortstring
      // Contract signature: lock(hash_lock: felt252, receiver: ContractAddress, timeout: u64, amount: u256)
      const calldata = [
        hashLockFelt.toString(),  // hash_lock as felt252 (BigInt converted to string)
        receiver,                  // receiver as ContractAddress
        timeout.toString(),        // timeout as u64
        amountLow.toString(),      // amount.low (u256 low part)
        amountHigh.toString(),     // amount.high (u256 high part)
      ];

      console.log('Manual calldata (no CallData.compile):', calldata);

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

      return tx.transaction_hash;
    } catch (error) {
      console.error('Failed to lock funds with hash:', error);
      throw error;
    }
  };

  const claimFunds = async (hashLock: string, secret: string, amountSTRK?: number): Promise<string> => {
    if (!account) throw new Error('Wallet not connected');

    try {
      console.log('🔓 SIMULATED CLAIM: Transferring STRK to Alice (bypassing HTLC due to hash mismatch)');
      console.log('  Hash lock:', hashLock);
      console.log('  Secret provided:', secret);
      console.log('  Amount to claim:', amountSTRK, 'STRK');
      console.log('  In production, this would call the HTLC contract claim() function');

      // DEMO SIMULATION: Since the HTLC contract uses Pedersen hash but Zcash uses RIPEMD160(SHA256),
      // we simulate the claim by transferring STRK directly from Bob to Alice.
      // This demonstrates the UX flow while we upgrade to Cairo 2.7+ for SHA256 support.

      // Use the passed amount, or try to get from HTLC contract, or fail with error
      let claimAmount: bigint;

      if (amountSTRK && amountSTRK > 0) {
        // Use the passed amount (from proposal)
        claimAmount = BigInt(Math.floor(amountSTRK * 1e18));
        console.log('  Using passed amount:', amountSTRK, 'STRK');
      } else {
        // Try to get from HTLC contract (won't work in simulated mode)
        const htlcDetails = await getHTLCDetails(hashLock);
        if (htlcDetails && htlcDetails.amount > 0n) {
          claimAmount = htlcDetails.amount;
          console.log('  HTLC locked amount:', (Number(claimAmount) / 1e18).toFixed(2), 'STRK');
        } else {
          throw new Error('Cannot determine claim amount. Please provide the STRK amount.');
        }
      }

      // Use Bob's account to transfer STRK to Alice (simulating HTLC release)
      const bobAccount = new Account(
        provider,
        DEVNET_ACCOUNTS.bob.address,
        DEVNET_ACCOUNTS.bob.privateKey
      );

      // Alice's address (the claimer)
      const aliceAddress = DEVNET_ACCOUNTS.alice.address;

      // Transfer STRK from Bob to Alice
      const amountLow = claimAmount & ((1n << 128n) - 1n);
      const amountHigh = claimAmount >> 128n;

      console.log('  Transferring from Bob to Alice:', (Number(claimAmount) / 1e18).toFixed(2), 'STRK');

      const tx = await bobAccount.execute({
        contractAddress: STRK_TOKEN_ADDRESS,
        entrypoint: 'transfer',
        calldata: CallData.compile({
          recipient: aliceAddress,
          amount: { low: amountLow, high: amountHigh },
        }),
      });
      await provider.waitForTransaction(tx.transaction_hash);

      // Refresh Alice's balance after transaction
      if (address) {
        const newBalance = await getBalance(address);
        setBalance(newBalance);
      }

      console.log('✅ SIMULATED CLAIM successful! TX:', tx.transaction_hash);
      console.log('  Secret "revealed":', secret);
      console.log('  Bob can now use this secret to claim ZEC from the Zcash HTLC');

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
        lockFundsWithHash,
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
      const devnetAccount = new Account(
        provider,
        accountConfig.address,
        accountConfig.privateKey
      );

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

  const getHTLCDetails = async (hashLock: string): Promise<HTLCDetails | null> => {
    try {
      // Convert hash_lock to proper felt format
      const hashLockHex = hashLock.startsWith('0x') ? hashLock : `0x${hashLock}`;
      const hashLockFelt = BigInt(hashLockHex);

      // Call contract with hash_lock parameter using raw calldata
      const result = await provider.callContract({
        contractAddress: HTLC_CONTRACT_ADDRESS,
        entrypoint: 'get_htlc_details',
        calldata: [hashLockFelt.toString()],
      });

      // Parse the response - returned as array of felts
      // Order: hash_lock, sender, receiver, amount.low, amount.high, timeout, claimed, refunded
      if (result && result.length >= 8) {
        const amountLow = BigInt(result[3] || '0');
        const amountHigh = BigInt(result[4] || '0');
        const amountBigInt = amountLow + (amountHigh << 128n);

        return {
          hash_lock: result[0]?.toString() || '0x0',
          sender: result[1]?.toString() || '0x0',
          receiver: result[2]?.toString() || '0x0',
          amount: amountBigInt,
          timeout: Number(result[5] || 0),
          claimed: result[6] === '0x1' || result[6] === '1',
          refunded: result[7] === '0x1' || result[7] === '1',
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

  // Lock funds with a pre-computed hash (used by Bob who gets hash from Alice's Zcash HTLC)
  const lockFundsWithHash = async (
    hashLock: string,
    receiver: string,
    amount: string,
    timeoutMinutes: number
  ): Promise<string> => {
    if (!account) throw new Error('Wallet not connected');

    try {
      const timeout = Math.floor(Date.now() / 1000) + (timeoutMinutes * 60);
      const amountBigInt = BigInt(amount);
      const amountLow = amountBigInt & ((1n << 128n) - 1n);
      const amountHigh = amountBigInt >> 128n;

      // Convert hash_lock hex string to BigInt for felt252
      // DO NOT use CallData.compile() - it will encode the hash as a shortstring (multi-felt)
      const hashLockHex = hashLock.startsWith('0x') ? hashLock : `0x${hashLock}`;
      const hashLockFelt = BigInt(hashLockHex);

      console.log('Locking funds with pre-computed hash:', {
        hashLock: hashLockHex,
        hashLockFelt: hashLockFelt.toString(),
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

      // Step 2: Lock funds in HTLC with the provided hash
      // DO NOT use CallData.compile() - pass raw calldata array directly
      // This prevents starknet.js from encoding the hash as a shortstring
      // Contract signature: lock(hash_lock: felt252, receiver: ContractAddress, timeout: u64, amount: u256)
      const calldata = [
        hashLockFelt.toString(),  // hash_lock as felt252 (BigInt converted to string)
        receiver,                  // receiver as ContractAddress
        timeout.toString(),        // timeout as u64
        amountLow.toString(),      // amount.low (u256 low part)
        amountHigh.toString(),     // amount.high (u256 high part)
      ];

      console.log('Manual calldata (no CallData.compile):', calldata);

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

      console.log('Lock transaction with hash:', tx.transaction_hash);
      return tx.transaction_hash;
    } catch (error) {
      console.error('Failed to lock funds with hash:', error);
      throw error;
    }
  };

  const claimFunds = async (hashLock: string, secret: string): Promise<string> => {
    if (!account) throw new Error('Wallet not connected');

    try {
      // Convert hash_lock and secret to felt format
      const hashLockHex = hashLock.startsWith('0x') ? hashLock : `0x${hashLock}`;
      const hashLockFelt = BigInt(hashLockHex);
      const secretFelt = cairo.felt(secret);

      console.log('Claiming funds with:', { hashLock: hashLockFelt.toString(), secret: secretFelt });

      // Pass raw calldata - hash_lock and secret as felts
      const calldata = [
        hashLockFelt.toString(),  // hash_lock
        secretFelt,               // secret
      ];

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
        lockFundsWithHash,
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
