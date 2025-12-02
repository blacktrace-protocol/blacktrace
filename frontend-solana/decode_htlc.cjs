const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const HTLC_PROGRAM_ID = 'CUxqXa849pvw3TLEWRrA2RyA3vm5SXXwb181BFnRSvej';
const RPC_URL = 'http://127.0.0.1:8899';

function hexToBytes(hex) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function queryHTLC(hashLockHex) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(HTLC_PROGRAM_ID);
  
  // Convert hash lock to bytes and derive PDA
  const hashLock = hexToBytes(hashLockHex);
  const [pdaAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from('htlc'), hashLock],
    programId
  );
  
  console.log('='.repeat(60));
  console.log('   SOLANA HTLC CONTRACT - REAL BLOCKCHAIN DATA');
  console.log('='.repeat(60));
  console.log('');
  console.log('HTLC Program ID:', HTLC_PROGRAM_ID);
  console.log('Hash Lock:', hashLockHex);
  console.log('Derived PDA Address:', pdaAddress.toBase58());
  console.log('');
  
  const accountInfo = await connection.getAccountInfo(pdaAddress);
  
  if (!accountInfo) {
    console.log('❌ HTLC Account NOT FOUND - No SOL locked with this hash lock');
    return;
  }
  
  console.log('--- Account Info (from blockchain) ---');
  console.log('Owner Program:', accountInfo.owner.toBase58());
  console.log('Account Balance:', accountInfo.lamports / LAMPORTS_PER_SOL, 'SOL');
  console.log('Data Size:', accountInfo.data.length, 'bytes');
  console.log('');
  
  // Decode HTLC data
  const data = accountInfo.data;
  const offset = 8; // Skip Anchor discriminator
  
  const storedHashLock = bytesToHex(data.slice(offset, offset + 20));
  const sender = new PublicKey(data.slice(offset + 20, offset + 52)).toBase58();
  const receiver = new PublicKey(data.slice(offset + 52, offset + 84)).toBase58();
  const amount = data.readBigUInt64LE(offset + 84);
  const timeout = Number(data.readBigInt64LE(offset + 92));
  const claimed = data[offset + 100] === 1;
  const refunded = data[offset + 101] === 1;
  
  console.log('--- Decoded HTLC Data ---');
  console.log('Hash Lock (HASH160):', storedHashLock);
  console.log('Sender:', sender);
  console.log('Receiver:', receiver);
  console.log('Amount Locked:', Number(amount) / LAMPORTS_PER_SOL, 'SOL');
  console.log('Timeout:', new Date(timeout * 1000).toISOString());
  console.log('Claimed:', claimed ? 'YES ✓' : 'NO');
  console.log('Refunded:', refunded ? 'YES ✓' : 'NO');
  console.log('');
  
  // Status
  console.log('--- Status ---');
  if (claimed) {
    console.log('🎉 HTLC CLAIMED - SOL transferred to receiver');
  } else if (refunded) {
    console.log('↩️ HTLC REFUNDED - SOL returned to sender');
  } else {
    console.log('🔒 HTLC ACTIVE - SOL is locked in contract');
    const now = Date.now() / 1000;
    if (now >= timeout) {
      console.log('⏰ Timeout PASSED - refund is possible');
    } else {
      const mins = Math.floor((timeout - now) / 60);
      console.log('⏳ Timeout in', mins, 'minutes');
    }
  }
}

const hashLock = process.argv[2];
if (!hashLock) {
  console.log('Usage: node decode_htlc.cjs <hash_lock_hex>');
  console.log('Example: node decode_htlc.cjs f3f08330eeb9fc3591551f43344e88888de3158e');
  process.exit(1);
}

queryHTLC(hashLock).catch(console.error);
