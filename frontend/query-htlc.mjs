import { RpcProvider, Contract } from 'starknet';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const HTLC_CONTRACT_ADDRESS = '0x5ea26dc7949cc4667f225a9894e23f67861b934cc37e0a5eb7a19cfebefe664';

const HTLC_ABI = [
  {
    name: 'get_htlc_details',
    type: 'function',
    inputs: [],
    outputs: [
      {
        type: 'struct',
        name: 'HTLCDetails',
        members: [
          { name: 'hash_lock', type: 'felt252' },
          { name: 'sender', type: 'ContractAddress' },
          { name: 'receiver', type: 'ContractAddress' },
          { name: 'amount', type: 'u256' },
          { name: 'timeout', type: 'u64' },
          { name: 'claimed', type: 'bool' },
          { name: 'refunded', type: 'bool' },
        ],
      },
    ],
    state_mutability: 'view',
  },
];

async function main() {
  console.log('🔍 Querying HTLC contract state...\n');

  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });
  const contract = new Contract({
    abi: HTLC_ABI,
    address: HTLC_CONTRACT_ADDRESS,
    providerOrAccount: provider,
  });

  try {
    const result = await contract.get_htlc_details();

    console.log('Raw result:', result);
    console.log('\n📋 HTLC Details:');
    console.log('  Hash Lock:', result.hash_lock?.toString() || 'N/A');
    console.log('  Sender:', result.sender?.toString() || 'N/A');
    console.log('  Receiver:', result.receiver?.toString() || 'N/A');
    console.log('  Amount:', result.amount ? `${result.amount.low || result.amount} STRK` : 'N/A');
    console.log('  Timeout:', result.timeout?.toString() || 'N/A');
    console.log('  Claimed:', result.claimed || false);
    console.log('  Refunded:', result.refunded || false);
  } catch (error) {
    console.error('❌ Error querying contract:', error.message);
    console.error('Full error:', error);
  }
}

main().catch(console.error);
