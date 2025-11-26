import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  const classHash = await provider.getClassHashAt(STRK_TOKEN_ADDRESS);
  const contractClass = await provider.getClass(classHash);

  console.log('📋 All Functions in STRK Token Contract:\n');

  const functions = contractClass.abi?.filter(item => item.type === 'function') || [];

  functions.forEach((func, i) => {
    const num = i + 1;
    console.log(`${num}. ${func.name}`);
    if (func.name.toLowerCase().includes('transfer') ||
        func.name.toLowerCase().includes('approve') ||
        func.name.toLowerCase().includes('allowance')) {
      console.log('   Inputs:', JSON.stringify(func.inputs, null, 2));
      console.log('   Outputs:', JSON.stringify(func.outputs, null, 2));
      console.log('');
    }
  });
}

main().catch(console.error);
