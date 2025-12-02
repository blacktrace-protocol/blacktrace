import { RpcProvider, CallData } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const HTLC_CONTRACT_ADDRESS = '0x59cdce87f46c682ebedc1c5d7cfe2823110f84c54213f860944ef11c0b3ca7c';

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

  console.log('📊 Checking HTLC Contract STRK Balance\n');

  const result = await provider.callContract({
    contractAddress: STRK_TOKEN_ADDRESS,
    entrypoint: 'balanceOf',
    calldata: CallData.compile({ account: HTLC_CONTRACT_ADDRESS }),
  });

  if (result && result.length >= 2) {
    const low = BigInt(result[0] || '0');
    const high = BigInt(result[1] || '0');
    const balanceBigInt = low + (high << 128n);
    const strkBalance = Number(balanceBigInt) / 1e18;

    console.log('HTLC Contract:');
    console.log('  Address:', HTLC_CONTRACT_ADDRESS);
    console.log('  Balance:', strkBalance.toFixed(4), 'STRK');
    console.log('  Balance (wei):', balanceBigInt.toString());

    if (balanceBigInt === 0n) {
      console.log('\n❌ Contract has ZERO balance!');
      console.log('   This means Bob\'s lock did not transfer tokens to the contract.');
    } else {
      console.log('\n✅ Contract has tokens');
    }
  }
}

main().catch(console.error);
