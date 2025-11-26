import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const LOCK_TX_HASH = '0x1f37e00e50785d9f7536a6bee22406529bb5bae2d279d33a8a96daa70904f7e';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('Fetching lock transaction...\n');
  const receipt = await provider.getTransactionReceipt(LOCK_TX_HASH);

  console.log('Transaction receipt:');
  console.log(JSON.stringify(receipt, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2
  ));

  // Look for Locked event
  if (receipt.events && receipt.events.length > 0) {
    console.log('\n📋 Events:');
    receipt.events.forEach((event, i) => {
      console.log(`\nEvent ${i}:`);
      console.log('  from_address:', event.from_address);
      console.log('  keys:', event.keys);
      console.log('  data:', event.data);
    });
  }

  // Try to get the transaction itself
  const tx = await provider.getTransaction(LOCK_TX_HASH);
  console.log('\n📋 Transaction:');
  console.log(JSON.stringify(tx, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2
  ));
}

main().catch(console.error);
