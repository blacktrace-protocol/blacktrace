import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  const classHash = await provider.getClassHashAt(STRK_TOKEN_ADDRESS);
  const contractClass = await provider.getClass(classHash);

  console.log('📋 Complete STRK Token ABI:\n');

  const functions = contractClass.abi?.filter(item => item.type === 'function') || [];

  functions.forEach((func, i) => {
    console.log(`${i + 1}. ${func.name}`);
    console.log('   Type:', func.type);
    if (func.inputs && func.inputs.length > 0) {
      console.log('   Inputs:', JSON.stringify(func.inputs, null, 2));
    }
    if (func.outputs && func.outputs.length > 0) {
      console.log('   Outputs:', JSON.stringify(func.outputs, null, 2));
    }
    console.log('');
  });

  console.log('\n🔍 Looking specifically for ERC20 standard functions:\n');

  const erc20Functions = ['transfer', 'transferFrom', 'transfer_from', 'approve', 'allowance', 'balanceOf', 'balance_of'];

  erc20Functions.forEach(name => {
    const found = functions.find(f => f.name === name);
    if (found) {
      console.log(`✅ ${name}:`);
      console.log('   Inputs:', JSON.stringify(found.inputs, null, 2));
      console.log('   Outputs:', JSON.stringify(found.outputs, null, 2));
      console.log('');
    } else {
      console.log(`❌ ${name}: NOT FOUND`);
    }
  });
}

main().catch(console.error);
