/**
 * IDL for BlackTrace HTLC Program on Solana
 *
 * This IDL describes the HTLC contract interface for:
 * - Locking native SOL with HASH160 hash lock (RIPEMD160(SHA256(secret)))
 * - Claiming SOL by revealing the secret
 * - Refunding SOL after timeout
 *
 * Uses 20-byte HASH160 for Zcash compatibility
 * Uses native SOL (lamports), not SPL tokens
 */

export const HTLC_IDL = {
  version: "0.1.0",
  name: "blacktrace_htlc",
  instructions: [
    {
      name: "lock",
      accounts: [
        { name: "htlc", isMut: true, isSigner: false },
        { name: "sender", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "hashLock", type: { array: ["u8", 20] } }, // HASH160 = 20 bytes
        { name: "receiver", type: "publicKey" },
        { name: "amount", type: "u64" },
        { name: "timeout", type: "i64" },
      ],
    },
    {
      name: "claim",
      accounts: [
        { name: "htlc", isMut: true, isSigner: false },
        { name: "receiver", isMut: true, isSigner: true },
      ],
      args: [
        { name: "hashLock", type: { array: ["u8", 20] } }, // HASH160 = 20 bytes
        { name: "secret", type: "bytes" },
      ],
    },
    {
      name: "refund",
      accounts: [
        { name: "htlc", isMut: true, isSigner: false },
        { name: "sender", isMut: true, isSigner: true },
      ],
      args: [
        { name: "hashLock", type: { array: ["u8", 20] } }, // HASH160 = 20 bytes
      ],
    },
  ],
  accounts: [
    {
      name: "HTLCAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "hashLock", type: { array: ["u8", 20] } }, // HASH160 = 20 bytes
          { name: "sender", type: "publicKey" },
          { name: "receiver", type: "publicKey" },
          { name: "amount", type: "u64" },
          { name: "timeout", type: "i64" },
          { name: "claimed", type: "bool" },
          { name: "refunded", type: "bool" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  events: [
    {
      name: "Locked",
      fields: [
        { name: "hashLock", type: { array: ["u8", 20] }, index: false }, // HASH160 = 20 bytes
        { name: "sender", type: "publicKey", index: false },
        { name: "receiver", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "timeout", type: "i64", index: false },
      ],
    },
    {
      name: "Claimed",
      fields: [
        { name: "hashLock", type: { array: ["u8", 20] }, index: false }, // HASH160 = 20 bytes
        { name: "receiver", type: "publicKey", index: false },
        { name: "secret", type: "bytes", index: false },
        { name: "amount", type: "u64", index: false },
      ],
    },
    {
      name: "Refunded",
      fields: [
        { name: "hashLock", type: { array: ["u8", 20] }, index: false }, // HASH160 = 20 bytes
        { name: "sender", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
      ],
    },
  ],
  errors: [
    { code: 6000, name: "InvalidTimeout", msg: "Invalid timeout: must be in the future" },
    { code: 6001, name: "InvalidAmount", msg: "Invalid amount: must be greater than zero" },
    { code: 6002, name: "InvalidSecret", msg: "Invalid secret: HASH160(secret) does not match hash_lock" },
    { code: 6003, name: "AlreadyClaimed", msg: "HTLC has already been claimed" },
    { code: 6004, name: "AlreadyRefunded", msg: "HTLC has already been refunded" },
    { code: 6005, name: "TimeoutNotReached", msg: "Timeout has not been reached yet" },
    { code: 6006, name: "NotReceiver", msg: "Only the receiver can claim" },
    { code: 6007, name: "NotSender", msg: "Only the sender can refund" },
    { code: 6008, name: "HashMismatch", msg: "Hash lock mismatch" },
  ],
} as const;

// Program ID from deployed contract
export const HTLC_PROGRAM_ID = "CUxqXa849pvw3TLEWRrA2RyA3vm5SXXwb181BFnRSvej";

// HTLC Account size for rent calculation (native SOL version)
// Layout: discriminator(8) + hash_lock(20) + sender(32) + receiver(32) + amount(8) + timeout(8) + claimed(1) + refunded(1) + bump(1)
export const HTLC_ACCOUNT_SIZE = 8 + 20 + 32 + 32 + 8 + 8 + 1 + 1 + 1; // 111 bytes

// Type definitions for TypeScript
export interface HTLCAccountData {
  hashLock: Uint8Array;
  sender: string;
  receiver: string;
  tokenMint: string; // 'native' for SOL
  amount: bigint;
  timeout: number;
  claimed: boolean;
  refunded: boolean;
  bump: number;
}

export interface LockParams {
  hashLock: Uint8Array;
  receiver: string;
  amount: bigint;
  timeoutSeconds: number;
}

export interface ClaimParams {
  hashLock: Uint8Array;
  secret: Uint8Array;
}
