import { RpcProvider } from 'starknet';
import { writeFileSync } from 'fs';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  const classHash = await provider.getClassHashAt(STRK_TOKEN_ADDRESS);
  const contractClass = await provider.getClass(classHash);

  console.log('📋 Raw ABI Structure:\n');
  console.log('Total ABI items:', contractClass.abi?.length || 0);
  console.log('');

  // Simple listing
  contractClass.abi?.forEach((item, i) => {
    console.log(`${i + 1}. Type: ${item.type}, Name: ${item.name || 'N/A'}`);
  });
  console.log('');

  // Check interface items
  const interfaces = contractClass.abi?.filter(item => item.type === 'interface') || [];
  console.log('\n🔍 Interface Details:\n');

  interfaces.forEach(iface => {
    console.log(`Interface: ${iface.name}`);
    if (iface.items) {
      iface.items.forEach(item => {
        if (item.type === 'function') {
          console.log(`  ✓ ${item.name} (${item.inputs?.length || 0} inputs, ${item.outputs?.length || 0} outputs)`);
        }
      });
    }
    console.log('');
  });

  // Save full ABI to file for inspection
  writeFileSync('strk-abi-full.json', JSON.stringify(contractClass.abi, null, 2));
  console.log('💾 Full ABI saved to strk-abi-full.json');
}

main().catch(console.error);
