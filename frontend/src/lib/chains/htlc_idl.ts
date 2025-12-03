/**
 * IDL for BlackTrace HTLC Program on Solana
 *
 * This IDL describes the HTLC contract interface for:
 * - Locking SOL tokens with SHA256 hash lock
 * - Claiming tokens by revealing the secret
 * - Refunding tokens after timeout
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
        { name: "tokenMint", isMut: false, isSigner: false },
        { name: "senderTokenAccount", isMut: true, isSigner: false },
        { name: "htlcTokenAccount", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
        { name: "rent", isMut: false, isSigner: false },
      ],
      args: [
        { name: "hashLock", type: { array: ["u8", 32] } },
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
        { name: "htlcTokenAccount", isMut: true, isSigner: false },
        { name: "receiverTokenAccount", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "hashLock", type: { array: ["u8", 32] } },
        { name: "secret", type: "bytes" },
      ],
    },
    {
      name: "refund",
      accounts: [
        { name: "htlc", isMut: true, isSigner: false },
        { name: "sender", isMut: true, isSigner: true },
        { name: "htlcTokenAccount", isMut: true, isSigner: false },
        { name: "senderTokenAccount", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "hashLock", type: { array: ["u8", 32] } },
      ],
    },
  ],
  accounts: [
    {
      name: "HTLCAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "hashLock", type: { array: ["u8", 32] } },
          { name: "sender", type: "publicKey" },
          { name: "receiver", type: "publicKey" },
          { name: "tokenMint", type: "publicKey" },
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
        { name: "hashLock", type: { array: ["u8", 32] }, index: false },
        { name: "sender", type: "publicKey", index: false },
        { name: "receiver", type: "publicKey", index: false },
        { name: "tokenMint", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "timeout", type: "i64", index: false },
      ],
    },
    {
      name: "Claimed",
      fields: [
        { name: "hashLock", type: { array: ["u8", 32] }, index: false },
        { name: "receiver", type: "publicKey", index: false },
        { name: "secret", type: "bytes", index: false },
        { name: "amount", type: "u64", index: false },
      ],
    },
    {
      name: "Refunded",
      fields: [
        { name: "hashLock", type: { array: ["u8", 32] }, index: false },
        { name: "sender", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
      ],
    },
  ],
  errors: [
    { code: 6000, name: "InvalidTimeout", msg: "Invalid timeout: must be in the future" },
    { code: 6001, name: "InvalidAmount", msg: "Invalid amount: must be greater than zero" },
    { code: 6002, name: "InvalidSecret", msg: "Invalid secret: SHA256(secret) does not match hash_lock" },
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

// HTLC Account size for rent calculation
export const HTLC_ACCOUNT_SIZE = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1 + 1; // 155 bytes

// Type definitions for TypeScript
export interface HTLCAccountData {
  hashLock: Uint8Array;
  sender: string;
  receiver: string;
  tokenMint: string;
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
