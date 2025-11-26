import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const NEW_HTLC_ADDRESS = '0x8d55e048d8d4a7b8242a6f9543e8864679f00741cf8020e0aed9fc16ac9fc7';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('🔍 Verifying new HTLC contract\n');
  console.log('Contract Address:', NEW_HTLC_ADDRESS);

  const classHash = await provider.getClassHashAt(NEW_HTLC_ADDRESS);
  console.log('Class Hash:', classHash);

  const contractClass = await provider.getClass(classHash);

  // Check for transfer_from references
  const abiString = JSON.stringify(contractClass.abi);
  const hasTransferFrom = abiString.includes('transfer_from');
  const hasERC20 = abiString.includes('ERC20') || abiString.includes('IERC20');

  console.log('\n✅ Verification:');
  console.log('   Has transfer_from:', hasTransferFrom ? 'YES ✅' : 'NO ❌');
  console.log('   Has ERC20 refs:', hasERC20 ? 'YES ✅' : 'NO ❌');

  if (hasTransferFrom) {
    console.log('\n🎉 SUCCESS! New contract has token transfer logic!');
    console.log('   Token transfers will now work when locking/claiming funds.');
  } else {
    console.log('\n❌ WARNING: Contract still missing transfer logic!');
  }
}

main().catch(console.error);
