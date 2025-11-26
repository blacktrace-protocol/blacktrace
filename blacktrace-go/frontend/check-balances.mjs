import { RpcProvider, CallData } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

const BOB = '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691';
const ALICE = '0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1';

async function getBalance(provider, address, name) {
  try {
    const result = await provider.callContract({
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: 'balanceOf',
      calldata: CallData.compile({ account: address }),
    });

    if (result && result.length >= 2) {
      const low = BigInt(result[0] || '0');
      const high = BigInt(result[1] || '0');
      const balanceBigInt = low + (high << 128n);
      const strkBalance = Number(balanceBigInt) / 1e18;

      console.log(`${name}:`);
      console.log(`  Address: ${address}`);
      console.log(`  Balance: ${strkBalance.toFixed(4)} STRK`);
      console.log(`  Balance (wei): ${balanceBigInt.toString()}`);
      console.log();

      return strkBalance;
    }
    return 0;
  } catch (error) {
    console.error(`Failed to get balance for ${name}:`, error.message);
    return 0;
  }
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('📊 Current STRK Balances\n');
  console.log('='.repeat(60));
  console.log();

  await getBalance(provider, BOB, 'Bob (Sender)');
  await getBalance(provider, ALICE, 'Alice (Receiver)');

  console.log('='.repeat(60));
}

main().catch(console.error);
