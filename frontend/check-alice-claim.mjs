import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const ALICE_CLAIM_TX = '0x2e5e67a5c283187277e2f1cd109dcc0a6338ab75b6a3ec026adbcd876a6bc4a';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('📋 Checking Alice claim transaction...\n');

  try {
    const receipt = await provider.getTransactionReceipt(ALICE_CLAIM_TX);

    console.log('Transaction Status:', receipt.execution_status);
    console.log('Finality Status:', receipt.finality_status);

    if (receipt.execution_status === 'REVERTED') {
      console.log('\n❌ Transaction REVERTED!');
      console.log('Revert reason:', receipt.revert_reason);
    } else {
      console.log('\n✅ Transaction SUCCEEDED');
    }

    console.log('\nEvents:', JSON.stringify(receipt.events, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
