import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const HTLC_CONTRACT_ADDRESS = '0xa421d8566725e4b0b7e85536a3547c829e784d45f36ff281085413dd0586b2';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('📋 Checking HTLC Status\n');

  const result = await provider.callContract({
    contractAddress: HTLC_CONTRACT_ADDRESS,
    entrypoint: 'get_htlc_details',
    calldata: [],
  });

  console.log('HTLC Details:');
  console.log('  hash_lock:', result[0]);
  console.log('  sender:', result[1]);
  console.log('  receiver:', result[2]);
  console.log('  amount (low):', result[3], '=', parseInt(result[3], 16), 'STRK');
  console.log('  amount (high):', result[4]);
  console.log('  timeout:', result[5]);
  console.log('  claimed:', result[6] === '0x1' ? '✅ YES' : '❌ NO');
  console.log('  refunded:', result[7] === '0x1' ? '✅ YES' : '❌ NO');

  if (result[6] === '0x1') {
    console.log('\n🎉 SUCCESS! Alice successfully claimed the funds!');
    console.log('\nNote: This is a demo contract that only tracks state.');
    console.log('It does NOT actually transfer STRK tokens.');
    console.log('Balance changes you see are only from gas fees.');
  }
}

main().catch(console.error);
