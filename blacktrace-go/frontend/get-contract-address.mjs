import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const TX_HASH = '0x4d757ce1df60a6899c18f2a11f3145ef93d801dcc03e8ed22bb94e1a041e099';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('🔍 Fetching transaction receipt...\n');
  const receipt = await provider.getTransactionReceipt(TX_HASH);

  console.log('📋 Full receipt:', JSON.stringify(receipt, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2
  ));

  // Try to extract contract address from events
  if (receipt.events && receipt.events.length > 0) {
    console.log('\n📦 Events:', receipt.events);
  }

  // Check if there's a contract_address field
  if (receipt.contract_address) {
    console.log('\n✅ Contract Address:', receipt.contract_address);
  }
}

main().catch(console.error);
