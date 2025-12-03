/**
 * HTLC Client for Solana
 *
 * Provides high-level functions for interacting with the BlackTrace HTLC program.
 * Uses native SOL for atomic swaps (compatible with Zcash SHA256 hash locks).
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import { HTLC_PROGRAM_ID, HTLC_ACCOUNT_SIZE, type HTLCAccountData, type LockParams, type ClaimParams } from './htlc_idl';
import { HashUtils } from './types';

// Native SOL uses a special mint address
const NATIVE_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/**
 * HTLC Client for interacting with the BlackTrace HTLC program
 */
export class HTLCClient {
  private connection: Connection;
  private programId: PublicKey;

  constructor(connection: Connection) {
    this.connection = connection;
    this.programId = new PublicKey(HTLC_PROGRAM_ID);
  }

  /**
   * Derive the HTLC PDA address from hash lock
   */
  deriveHTLCAddress(hashLock: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('htlc'), hashLock],
      this.programId
    );
  }

  /**
   * Derive the HTLC vault token account PDA
   */
  deriveHTLCVaultAddress(hashLock: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('htlc_vault'), hashLock],
      this.programId
    );
  }

  /**
   * Convert hex string to Uint8Array
   */
  private hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Convert Uint8Array to hex string
   */
  private bytesToHex(bytes: Uint8Array): string {
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Build the lock instruction data
   * Format: [discriminator(8)] [hash_lock(32)] [receiver(32)] [amount(8)] [timeout(8)]
   */
  private buildLockInstructionData(
    hashLock: Uint8Array,
    receiver: PublicKey,
    amount: bigint,
    timeout: bigint
  ): Buffer {
    // Anchor discriminator for "lock" instruction
    const discriminator = Buffer.from([21, 19, 208, 43, 237, 62, 255, 87]); // SHA256("global:lock")[0:8]

    const data = Buffer.alloc(8 + 32 + 32 + 8 + 8);
    discriminator.copy(data, 0);
    Buffer.from(hashLock).copy(data, 8);
    receiver.toBuffer().copy(data, 40);
    data.writeBigUInt64LE(amount, 72);
    data.writeBigInt64LE(timeout, 80);

    return data;
  }

  /**
   * Build the claim instruction data
   * Format: [discriminator(8)] [hash_lock(32)] [secret_len(4)] [secret(variable)]
   */
  private buildClaimInstructionData(hashLock: Uint8Array, secret: Uint8Array): Buffer {
    // Anchor discriminator for "claim" instruction
    const discriminator = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]); // SHA256("global:claim")[0:8]

    const data = Buffer.alloc(8 + 32 + 4 + secret.length);
    discriminator.copy(data, 0);
    Buffer.from(hashLock).copy(data, 8);
    data.writeUInt32LE(secret.length, 40);
    Buffer.from(secret).copy(data, 44);

    return data;
  }

  /**
   * Build the refund instruction data
   * Format: [discriminator(8)] [hash_lock(32)]
   */
  private buildRefundInstructionData(hashLock: Uint8Array): Buffer {
    // Anchor discriminator for "refund" instruction
    const discriminator = Buffer.from([2, 96, 183, 251, 63, 208, 46, 46]); // SHA256("global:refund")[0:8]

    const data = Buffer.alloc(8 + 32);
    discriminator.copy(data, 0);
    Buffer.from(hashLock).copy(data, 8);

    return data;
  }

  /**
   * Lock SOL in an HTLC
   *
   * @param sender - Keypair of the sender
   * @param hashLockHex - SHA256 hash of the secret (hex string)
   * @param receiver - Public key of the receiver
   * @param amountLamports - Amount in lamports to lock
   * @param timeoutSeconds - Timeout in seconds from now
   * @returns Transaction signature
   */
  async lockSOL(
    sender: Keypair,
    hashLockHex: string,
    receiver: string,
    amountLamports: bigint,
    timeoutSeconds: number
  ): Promise<string> {
    const hashLock = this.hexToBytes(hashLockHex);
    const receiverPubkey = new PublicKey(receiver);
    const timeout = BigInt(Math.floor(Date.now() / 1000) + timeoutSeconds);

    // Derive PDAs
    const [htlcPDA, htlcBump] = this.deriveHTLCAddress(hashLock);
    const [htlcVaultPDA, vaultBump] = this.deriveHTLCVaultAddress(hashLock);

    // Get or create sender's wrapped SOL token account
    const senderTokenAccount = await getAssociatedTokenAddress(
      NATIVE_SOL_MINT,
      sender.publicKey
    );

    // Build lock instruction
    const lockIxData = this.buildLockInstructionData(
      hashLock,
      receiverPubkey,
      amountLamports,
      timeout
    );

    const lockIx = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: htlcPDA, isSigner: false, isWritable: true },
        { pubkey: sender.publicKey, isSigner: true, isWritable: true },
        { pubkey: NATIVE_SOL_MINT, isSigner: false, isWritable: false },
        { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
        { pubkey: htlcVaultPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: lockIxData,
    });

    const transaction = new Transaction().add(lockIx);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [sender]
    );

    console.log('[HTLCClient] Locked SOL:', {
      signature,
      htlcPDA: htlcPDA.toBase58(),
      hashLock: hashLockHex,
      amount: `${Number(amountLamports) / LAMPORTS_PER_SOL} SOL`,
      receiver,
      timeout: new Date(Number(timeout) * 1000).toISOString(),
    });

    return signature;
  }

  /**
   * Lock native SOL using direct transfer (demo mode - simpler)
   * This transfers SOL to the HTLC escrow account directly.
   */
  async lockSOLDirect(
    sender: Keypair,
    hashLockHex: string,
    receiver: string,
    amountLamports: bigint,
    timeoutSeconds: number
  ): Promise<string> {
    const hashLock = this.hexToBytes(hashLockHex);

    // Derive the HTLC PDA that will hold the SOL
    const [htlcPDA] = this.deriveHTLCAddress(hashLock);

    // Calculate rent-exempt minimum for HTLC account
    const rentExemptMin = await this.connection.getMinimumBalanceForRentExemption(HTLC_ACCOUNT_SIZE);

    // Create and fund the HTLC account with SOL
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: htlcPDA,
        lamports: amountLamports + BigInt(rentExemptMin),
      })
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [sender]
    );

    console.log('[HTLCClient] Locked SOL (direct):', {
      signature,
      htlcPDA: htlcPDA.toBase58(),
      hashLock: hashLockHex,
      amount: `${Number(amountLamports) / LAMPORTS_PER_SOL} SOL`,
      receiver,
    });

    return signature;
  }

  /**
   * Claim SOL from an HTLC by revealing the secret
   *
   * @param receiver - Keypair of the receiver
   * @param hashLockHex - Hash lock (hex string)
   * @param secretHex - The secret pre-image (hex string)
   * @returns Transaction signature
   */
  async claimSOL(
    receiver: Keypair,
    hashLockHex: string,
    secretHex: string
  ): Promise<string> {
    const hashLock = this.hexToBytes(hashLockHex);
    const secret = this.hexToBytes(secretHex);

    // Verify secret matches hash lock
    const computedHash = await HashUtils.sha256(secret);
    if (this.bytesToHex(computedHash).toLowerCase() !== hashLockHex.toLowerCase()) {
      throw new Error('Invalid secret: SHA256(secret) does not match hash_lock');
    }

    // Derive PDAs
    const [htlcPDA] = this.deriveHTLCAddress(hashLock);
    const [htlcVaultPDA] = this.deriveHTLCVaultAddress(hashLock);

    // Get receiver's token account
    const receiverTokenAccount = await getAssociatedTokenAddress(
      NATIVE_SOL_MINT,
      receiver.publicKey
    );

    // Build claim instruction
    const claimIxData = this.buildClaimInstructionData(hashLock, secret);

    const claimIx = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: htlcPDA, isSigner: false, isWritable: true },
        { pubkey: receiver.publicKey, isSigner: true, isWritable: true },
        { pubkey: htlcVaultPDA, isSigner: false, isWritable: true },
        { pubkey: receiverTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: claimIxData,
    });

    const transaction = new Transaction().add(claimIx);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [receiver]
    );

    console.log('[HTLCClient] Claimed SOL:', {
      signature,
      htlcPDA: htlcPDA.toBase58(),
      hashLock: hashLockHex,
      secretRevealed: secretHex.substring(0, 20) + '...',
    });

    return signature;
  }

  /**
   * Claim SOL using direct transfer (demo mode)
   * In production, this would verify the secret on-chain.
   */
  async claimSOLDirect(
    receiver: Keypair,
    hashLockHex: string,
    secret: string,
    amountLamports: bigint
  ): Promise<string> {
    // Verify secret matches hash lock
    const computedHash = await HashUtils.computeHashLock(secret);
    const normalizedHashLock = hashLockHex.startsWith('0x') ? hashLockHex.slice(2) : hashLockHex;
    const normalizedComputed = computedHash.startsWith('0x') ? computedHash.slice(2) : computedHash;

    if (normalizedComputed.toLowerCase() !== normalizedHashLock.toLowerCase()) {
      throw new Error('Invalid secret: SHA256(secret) does not match hash_lock');
    }

    console.log('[HTLCClient] Claim verified:', {
      hashLock: hashLockHex.substring(0, 20) + '...',
      secret: secret.substring(0, 10) + '...',
      receiver: receiver.publicKey.toBase58(),
    });

    // In demo mode, funds were already transferred during lock
    // Return a mock signature
    const mockSignature = Array.from({ length: 88 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
        Math.floor(Math.random() * 62)
      ]
    ).join('');

    return mockSignature;
  }

  /**
   * Refund SOL from an expired HTLC
   *
   * @param sender - Keypair of the original sender
   * @param hashLockHex - Hash lock (hex string)
   * @returns Transaction signature
   */
  async refundSOL(sender: Keypair, hashLockHex: string): Promise<string> {
    const hashLock = this.hexToBytes(hashLockHex);

    // Derive PDAs
    const [htlcPDA] = this.deriveHTLCAddress(hashLock);
    const [htlcVaultPDA] = this.deriveHTLCVaultAddress(hashLock);

    // Get sender's token account
    const senderTokenAccount = await getAssociatedTokenAddress(
      NATIVE_SOL_MINT,
      sender.publicKey
    );

    // Build refund instruction
    const refundIxData = this.buildRefundInstructionData(hashLock);

    const refundIx = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: htlcPDA, isSigner: false, isWritable: true },
        { pubkey: sender.publicKey, isSigner: true, isWritable: true },
        { pubkey: htlcVaultPDA, isSigner: false, isWritable: true },
        { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: refundIxData,
    });

    const transaction = new Transaction().add(refundIx);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [sender]
    );

    console.log('[HTLCClient] Refunded SOL:', {
      signature,
      htlcPDA: htlcPDA.toBase58(),
      hashLock: hashLockHex,
    });

    return signature;
  }

  /**
   * Get HTLC account data
   */
  async getHTLCData(hashLockHex: string): Promise<HTLCAccountData | null> {
    const hashLock = this.hexToBytes(hashLockHex);
    const [htlcPDA] = this.deriveHTLCAddress(hashLock);

    try {
      const accountInfo = await this.connection.getAccountInfo(htlcPDA);
      if (!accountInfo) {
        return null;
      }

      // Parse account data (skip 8-byte Anchor discriminator)
      const data = accountInfo.data;
      const offset = 8;

      return {
        hashLock: new Uint8Array(data.slice(offset, offset + 32)),
        sender: new PublicKey(data.slice(offset + 32, offset + 64)).toBase58(),
        receiver: new PublicKey(data.slice(offset + 64, offset + 96)).toBase58(),
        tokenMint: new PublicKey(data.slice(offset + 96, offset + 128)).toBase58(),
        amount: data.readBigUInt64LE(offset + 128),
        timeout: Number(data.readBigInt64LE(offset + 136)),
        claimed: data[offset + 144] === 1,
        refunded: data[offset + 145] === 1,
        bump: data[offset + 146],
      };
    } catch (error) {
      console.error('[HTLCClient] Failed to get HTLC data:', error);
      return null;
    }
  }
}

// Export singleton factory
export const createHTLCClient = (connection: Connection) => new HTLCClient(connection);
