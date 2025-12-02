import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('📋 Fetching STRK Token Contract Info\n');

  try {
    const classHash = await provider.getClassHashAt(STRK_TOKEN_ADDRESS);
    console.log('Class Hash:', classHash);

    const contractClass = await provider.getClass(classHash);
    
    // Find transfer_from in ABI
    const transferFromFunc = contractClass.abi?.find(item => 
      item.type === 'function' && item.name === 'transferFrom'
    ) || contractClass.abi?.find(item => 
      item.type === 'function' && item.name === 'transfer_from'
    );

    console.log('\ntransfer_from function:');
    console.log(JSON.stringify(transferFromFunc, null, 2));

    // Find approve in ABI
    const approveFunc = contractClass.abi?.find(item =>
      item.type === 'function' && item.name === 'approve'
    );

    console.log('\napprove function:');
    console.log(JSON.stringify(approveFunc, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
