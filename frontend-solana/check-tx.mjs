import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const TX_HASH = '0x4d0a831284b3c0514fc34241b44f631cc3bb6461667767bcfda88e67c400e7c';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('🔍 Checking transaction status...\n');
  console.log('TX Hash:', TX_HASH);

  try {
    const receipt = await provider.getTransactionReceipt(TX_HASH);
    console.log('\n✅ Transaction Status:', receipt.execution_status);
    console.log('Finality:', receipt.finality_status);

    if (receipt.execution_status === 'REVERTED') {
      console.log('\n❌ Transaction reverted!');
      console.log('Revert reason:', receipt.revert_reason || 'Unknown');
    } else {
      console.log('\n✅ Transaction executed successfully!');
    }

    console.log('\nFull receipt:', JSON.stringify(receipt, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main().catch(console.error);
