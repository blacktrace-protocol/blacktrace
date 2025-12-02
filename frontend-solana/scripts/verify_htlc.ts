/**
 * Verify HTLC on Solana - check if SOL is locked in HTLC PDA
 *
 * Usage:
 *   npx ts-node scripts/verify_htlc.ts <hash_lock_hex>
 *
 * Example:
 *   npx ts-node scripts/verify_htlc.ts 0xabcdef1234567890abcdef1234567890abcdef12
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const HTLC_PROGRAM_ID = 'CUxqXa849pvw3TLEWRrA2RyA3vm5SXXwb181BFnRSvej';
const RPC_URL = 'http://127.0.0.1:8899';

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyHTLC(hashLockHex: string) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(HTLC_PROGRAM_ID);

  // Convert hash lock to bytes
  const hashLock = hexToBytes(hashLockHex);
  console.log('Hash Lock:', hashLockHex);
  console.log('Hash Lock bytes length:', hashLock.length);

  // Derive PDA
  const [htlcPDA, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('htlc'), hashLock],
    programId
  );

  console.log('\n=== HTLC PDA ===');
  console.log('Address:', htlcPDA.toBase58());
  console.log('Bump:', bump);

  // Get account info
  const accountInfo = await connection.getAccountInfo(htlcPDA);

  if (!accountInfo) {
    console.log('\n❌ HTLC account NOT FOUND - SOL is NOT locked');
    return;
  }

  const lamports = accountInfo.lamports;
  const solAmount = lamports / LAMPORTS_PER_SOL;

  console.log('\n✅ HTLC account EXISTS');
  console.log('Owner:', accountInfo.owner.toBase58());
  console.log('Lamports in account:', lamports, '(' + solAmount + ' SOL)');
  console.log('Data length:', accountInfo.data.length, 'bytes');

  // Parse account data (skip 8-byte Anchor discriminator)
  const data = accountInfo.data;
  const offset = 8;

  // Layout: hash_lock(20) + sender(32) + receiver(32) + amount(8) + timeout(8) + claimed(1) + refunded(1) + bump(1)
  const storedHashLock = bytesToHex(new Uint8Array(data.slice(offset, offset + 20)));
  const sender = new PublicKey(data.slice(offset + 20, offset + 52)).toBase58();
  const receiver = new PublicKey(data.slice(offset + 52, offset + 84)).toBase58();
  const amount = data.readBigUInt64LE(offset + 84);
  const timeout = Number(data.readBigInt64LE(offset + 92));
  const claimed = data[offset + 100] === 1;
  const refunded = data[offset + 101] === 1;
  const storedBump = data[offset + 102];

  console.log('\n=== HTLC Data ===');
  console.log('Hash Lock:', storedHashLock);
  console.log('Sender:', sender);
  console.log('Receiver:', receiver);
  console.log('Amount:', amount.toString(), 'lamports (' + (Number(amount) / LAMPORTS_PER_SOL) + ' SOL)');
  console.log('Timeout:', new Date(timeout * 1000).toISOString());
  console.log('Claimed:', claimed);
  console.log('Refunded:', refunded);
  console.log('Bump:', storedBump);

  // Status
  console.log('\n=== Status ===');
  if (claimed) {
    console.log('🎉 HTLC has been CLAIMED - receiver got the SOL');
  } else if (refunded) {
    console.log('↩️ HTLC has been REFUNDED - sender got the SOL back');
  } else {
    console.log('🔒 HTLC is LOCKED - waiting for claim or refund');
    const now = Date.now() / 1000;
    if (now >= timeout) {
      console.log('⏰ Timeout has PASSED - refund is now possible');
    } else {
      const remaining = timeout - now;
      console.log('⏳ Timeout in ' + Math.floor(remaining / 60) + ' minutes ' + Math.floor(remaining % 60) + ' seconds');
    }
  }
}

// Get hash lock from command line
const hashLock = process.argv[2];
if (!hashLock) {
  console.log('Usage: npx ts-node scripts/verify_htlc.ts <hash_lock_hex>');
  console.log('Example: npx ts-node scripts/verify_htlc.ts 0xabcdef1234567890abcdef1234567890abcdef12');
  process.exit(1);
}

verifyHTLC(hashLock).catch(console.error);
