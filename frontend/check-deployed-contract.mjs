import { RpcProvider } from 'starknet';
import { writeFileSync } from 'fs';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const HTLC_CONTRACT_ADDRESS = '0x59cdce87f46c682ebedc1c5d7cfe2823110f84c54213f860944ef11c0b3ca7c';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('🔍 Checking deployed HTLC contract\n');
  console.log('Contract Address:', HTLC_CONTRACT_ADDRESS);

  try {
    const classHash = await provider.getClassHashAt(HTLC_CONTRACT_ADDRESS);
    console.log('Class Hash:', classHash);

    const contractClass = await provider.getClass(classHash);

    // Check functions in ABI
    const functions = contractClass.abi?.filter(item => item.type === 'function') || [];

    console.log('\n📋 Functions in deployed contract:');
    functions.forEach((func, i) => {
      console.log(`  ${i + 1}. ${func.name}`);
    });

    // Look for lock function specifically
    const lockFunc = functions.find(f => f.name === 'lock');
    if (lockFunc) {
      console.log('\n🔒 lock() function details:');
      console.log(JSON.stringify(lockFunc, null, 2));
    }

    // Check if there are any references to STRK token or transfer_from
    const abiString = JSON.stringify(contractClass.abi);
    const hasSTRK = abiString.includes('STRK') || abiString.includes('transfer_from') || abiString.includes('ERC20');

    console.log('\n🔍 Does contract reference STRK/ERC20/transfer_from?', hasSTRK ? 'YES ✅' : 'NO ❌');

    if (!hasSTRK) {
      console.log('\n❌ PROBLEM FOUND!');
      console.log('   The deployed contract does NOT contain token transfer logic.');
      console.log('   This is likely the OLD version without transfer_from.');
      console.log('   You need to:');
      console.log('   1. Rebuild the htlc_with_transfers.cairo contract');
      console.log('   2. Declare the new class');
      console.log('   3. Deploy a new instance');
      console.log('   4. Update the HTLC_CONTRACT_ADDRESS in the frontend');
    }

    // Save ABI
    writeFileSync('htlc-deployed-abi.json', JSON.stringify(contractClass.abi, null, 2));
    console.log('\n💾 Full ABI saved to htlc-deployed-abi.json');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
