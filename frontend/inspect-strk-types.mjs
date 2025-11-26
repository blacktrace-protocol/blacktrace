import { RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('🔍 Inspecting STRK Token Types on Devnet\n');

  const classHash = await provider.getClassHashAt(STRK_TOKEN_ADDRESS);
  console.log('Class Hash:', classHash, '\n');

  const contractClass = await provider.getClass(classHash);

  // Key functions to check
  const functionsToCheck = [
    'balance_of', 'balanceOf',
    'total_supply', 'totalSupply',
    'approve',
    'transfer',
    'transfer_from', 'transferFrom',
    'allowance'
  ];

  console.log('📋 Checking ERC20 Function Signatures:\n');

  functionsToCheck.forEach(funcName => {
    const func = contractClass.abi?.find(item =>
      item.type === 'function' && item.name === funcName
    );

    if (func) {
      console.log(`✅ ${func.name}`);
      console.log('   Inputs:');
      func.inputs.forEach(input => {
        console.log(`     - ${input.name}: ${input.type}`);
      });
      console.log('   Outputs:');
      func.outputs.forEach(output => {
        console.log(`     - ${output.type || JSON.stringify(output)}`);
      });
      console.log('');
    }
  });

  // Also check the interface definition if available
  const interfaces = contractClass.abi?.filter(item => item.type === 'interface') || [];
  if (interfaces.length > 0) {
    console.log('\n📦 Interfaces:');
    interfaces.forEach(iface => {
      console.log(`   - ${iface.name}`);
    });
  }
}

main().catch(console.error);
