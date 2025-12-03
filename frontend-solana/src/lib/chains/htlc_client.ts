/**
 * HTLC Client for Solana
 *
 * Provides high-level functions for interacting with the BlackTrace HTLC program.
 * Uses native SOL for atomic swaps (compatible with Zcash HASH160 hash locks).
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { HTLC_PROGRAM_ID, type HTLCAccountData } from './htlc_idl';
import { HashUtils } from './types';

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
   * Format: [discriminator(8)] [hash_lock(20)] [receiver(32)] [amount(8)] [timeout(8)]
   * Note: hash_lock is HASH160 (20 bytes) for Zcash compatibility
   */
  private buildLockInstructionData(
    hashLock: Uint8Array,
    receiver: PublicKey,
    amount: bigint,
    timeout: bigint
  ): Buffer {
    // Anchor discriminator for "lock" instruction
    const discriminator = Buffer.from([21, 19, 208, 43, 237, 62, 255, 87]); // SHA256("global:lock")[0:8]

    const data = Buffer.alloc(8 + 20 + 32 + 8 + 8); // 20 bytes for HASH160
    discriminator.copy(data, 0);
    Buffer.from(hashLock).copy(data, 8);
    receiver.toBuffer().copy(data, 28); // 8 + 20 = 28
    data.writeBigUInt64LE(amount, 60); // 28 + 32 = 60
    data.writeBigInt64LE(timeout, 68); // 60 + 8 = 68

    return data;
  }

  /**
   * Build the claim instruction data
   * Format: [discriminator(8)] [hash_lock(20)] [secret_len(4)] [secret(variable)]
   * Note: hash_lock is HASH160 (20 bytes) for Zcash compatibility
   */
  private buildClaimInstructionData(hashLock: Uint8Array, secret: Uint8Array): Buffer {
    // Anchor discriminator for "claim" instruction
    const discriminator = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]); // SHA256("global:claim")[0:8]

    const data = Buffer.alloc(8 + 20 + 4 + secret.length); // 20 bytes for HASH160
    discriminator.copy(data, 0);
    Buffer.from(hashLock).copy(data, 8);
    data.writeUInt32LE(secret.length, 28); // 8 + 20 = 28
    Buffer.from(secret).copy(data, 32); // 28 + 4 = 32

    return data;
  }

  /**
   * Build the refund instruction data
   * Format: [discriminator(8)] [hash_lock(20)]
   * Note: hash_lock is HASH160 (20 bytes) for Zcash compatibility
   */
  private buildRefundInstructionData(hashLock: Uint8Array): Buffer {
    // Anchor discriminator for "refund" instruction
    const discriminator = Buffer.from([2, 96, 183, 251, 63, 208, 46, 46]); // SHA256("global:refund")[0:8]

    const data = Buffer.alloc(8 + 20); // 20 bytes for HASH160
    discriminator.copy(data, 0);
    Buffer.from(hashLock).copy(data, 8);

    return data;
  }

  /**
   * Lock native SOL in an HTLC
   *
   * @param sender - Keypair of the sender
   * @param hashLockHex - HASH160 hash of the secret (hex string)
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

    // Derive HTLC PDA
    const [htlcPDA] = this.deriveHTLCAddress(hashLock);

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
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
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
   * Lock native SOL in HTLC (alias for lockSOL)
   */
  async lockSOLDirect(
    sender: Keypair,
    hashLockHex: string,
    receiver: string,
    amountLamports: bigint,
    timeoutSeconds: number
  ): Promise<string> {
    return this.lockSOL(sender, hashLockHex, receiver, amountLamports, timeoutSeconds);
  }

  /**
   * Claim SOL from an HTLC by revealing the secret
   *
   * @param receiver - Keypair of the receiver
   * @param hashLockHex - Hash lock (hex string) - HASH160 format (20 bytes / 40 hex chars)
   * @param secret - The secret pre-image (string)
   * @returns Transaction signature
   */
  async claimSOL(
    receiver: Keypair,
    hashLockHex: string,
    secret: string
  ): Promise<string> {
    const hashLock = this.hexToBytes(hashLockHex);
    const secretBytes = new TextEncoder().encode(secret);

    // Verify secret matches hash lock using HASH160 = RIPEMD160(SHA256(secret))
    const computedHash = HashUtils.hash160(secretBytes);
    const normalizedHashLock = hashLockHex.startsWith('0x') ? hashLockHex.slice(2) : hashLockHex;
    const normalizedComputed = this.bytesToHex(computedHash).slice(2);

    if (normalizedComputed.toLowerCase() !== normalizedHashLock.toLowerCase()) {
      throw new Error('Invalid secret: HASH160(secret) does not match hash_lock');
    }

    // Derive HTLC PDA
    const [htlcPDA] = this.deriveHTLCAddress(hashLock);

    // Build claim instruction
    const claimIxData = this.buildClaimInstructionData(hashLock, secretBytes);

    const claimIx = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: htlcPDA, isSigner: false, isWritable: true },
        { pubkey: receiver.publicKey, isSigner: true, isWritable: true },
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
      secretRevealed: secret.substring(0, 10) + '...',
    });

    return signature;
  }

  /**
   * Claim SOL from HTLC (alias for claimSOL)
   */
  async claimSOLDirect(
    receiver: Keypair,
    hashLockHex: string,
    secret: string,
    _amountLamports: bigint
  ): Promise<string> {
    return this.claimSOL(receiver, hashLockHex, secret);
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

    // Derive HTLC PDA
    const [htlcPDA] = this.deriveHTLCAddress(hashLock);

    // Build refund instruction
    const refundIxData = this.buildRefundInstructionData(hashLock);

    const refundIx = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: htlcPDA, isSigner: false, isWritable: true },
        { pubkey: sender.publicKey, isSigner: true, isWritable: true },
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
   * Account layout (after 8-byte discriminator):
   * - hash_lock: 20 bytes (HASH160)
   * - sender: 32 bytes
   * - receiver: 32 bytes
   * - amount: 8 bytes
   * - timeout: 8 bytes
   * - claimed: 1 byte
   * - refunded: 1 byte
   * - bump: 1 byte
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

      // Updated offsets for native SOL HTLC (no token_mint field)
      return {
        hashLock: new Uint8Array(data.slice(offset, offset + 20)), // 20 bytes
        sender: new PublicKey(data.slice(offset + 20, offset + 52)).toBase58(), // 20 + 32 = 52
        receiver: new PublicKey(data.slice(offset + 52, offset + 84)).toBase58(), // 52 + 32 = 84
        tokenMint: 'native', // Native SOL, no token mint
        amount: BigInt(data.readBigUInt64LE(offset + 84).toString()), // 84
        timeout: Number(data.readBigInt64LE(offset + 92)), // 84 + 8 = 92
        claimed: data[offset + 100] === 1, // 92 + 8 = 100
        refunded: data[offset + 101] === 1, // 100 + 1 = 101
        bump: data[offset + 102], // 101 + 1 = 102
      };
    } catch (error) {
      console.error('[HTLCClient] Failed to get HTLC data:', error);
      return null;
    }
  }
}

// Export singleton factory
export const createHTLCClient = (connection: Connection) => new HTLCClient(connection);
