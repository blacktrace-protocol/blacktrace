import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const HTLC_CONTRACT_ADDRESS = '0x149a750e4aad95269d08e523fa92b0c1ccb847143af60eb5230283a694b5d9d';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  // Try using callContract directly
  const result = await provider.callContract({
    contractAddress: HTLC_CONTRACT_ADDRESS,
    entrypoint: 'get_htlc_details',
    calldata: [],
  });

  console.log('Raw HTLC details result:', result);
  console.log('\nFormatted:');
  console.log('hash_lock:', result[0]);
  console.log('sender:', result[1]);
  console.log('receiver:', result[2]);
  console.log('amount (low):', result[3]);
  console.log('amount (high):', result[4]);
  console.log('timeout:', result[5]);
  console.log('claimed:', result[6]);
  console.log('refunded:', result[7]);

  console.log('\n\nExpected hash_lock for "test123":');
  console.log('0x174faa51a2bee741932084f1b3daffcacebec8ac5567b08b3e54b24951cc1ef');
  console.log('\nActual hash_lock in contract:');
  console.log(result[0]);
  console.log('\nDo they match?', result[0] === '0x174faa51a2bee741932084f1b3daffcacebec8ac5567b08b3e54b24951cc1ef');
}

main().catch(console.error);
