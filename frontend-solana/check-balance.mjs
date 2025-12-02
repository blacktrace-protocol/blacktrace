import { RpcProvider, Contract } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const BOB_ADDRESS = '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691';
const ALICE_ADDRESS = '0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1';

async function main() {
  console.log('🔍 Checking STRK balances...\n');

  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  // Simple ERC20 ABI
  const erc20Abi = [
    {
      name: 'balanceOf',
      type: 'function',
      inputs: [{ name: 'account', type: 'ContractAddress' }],
      outputs: [{ type: 'u256' }],
      state_mutability: 'view',
    },
  ];

  try {
    const tokenContract = new Contract({
      abi: erc20Abi,
      address: STRK_TOKEN_ADDRESS,
      providerOrAccount: provider,
    });

    console.log('📊 Querying Bob\'s balance...');
    const bobResult = await tokenContract.balanceOf(BOB_ADDRESS);
    console.log('Raw Bob result:', bobResult);

    console.log('\n📊 Querying Alice\'s balance...');
    const aliceResult = await tokenContract.balanceOf(ALICE_ADDRESS);
    console.log('Raw Alice result:', aliceResult);

    // Try to parse
    const parseBigInt = (result) => {
      if (!result) return 0n;
      if (typeof result === 'bigint') return result;
      if (typeof result === 'object' && 'low' in result) {
        const low = BigInt(result.low?.toString() || '0');
        const high = BigInt(result.high?.toString() || '0');
        return low + (high << 128n);
      }
      return BigInt(result.toString());
    };

    const bobBalance = parseBigInt(bobResult);
    const aliceBalance = parseBigInt(aliceResult);

    console.log('\n💰 Balances:');
    console.log('Bob:', (Number(bobBalance) / 1e18).toFixed(4), 'STRK');
    console.log('Alice:', (Number(aliceBalance) / 1e18).toFixed(4), 'STRK');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

main().catch(console.error);
