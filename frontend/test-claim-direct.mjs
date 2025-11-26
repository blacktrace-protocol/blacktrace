import { Account, RpcProvider, Contract, cairo, CallData } from 'starknet';
import { pedersen } from '@scure/starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const HTLC_CONTRACT_ADDRESS = '0x149a750e4aad95269d08e523fa92b0c1ccb847143af60eb5230283a694b5d9d';

const ALICE = {
  address: '0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1',
  privateKey: '0x000000000000000000000000000000000e1406455b7d66b1690803be066cbe5e',
};

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });
  const account = new Account({
    provider,
    address: ALICE.address,
    signer: ALICE.privateKey,
  });

  console.log('Alice account:', ALICE.address);

  // Get current HTLC details
  const htlcResult = await provider.callContract({
    contractAddress: HTLC_CONTRACT_ADDRESS,
    entrypoint: 'get_htlc_details',
    calldata: [],
  });

  console.log('\nCurrent HTLC state:');
  console.log('  hash_lock:', htlcResult[0]);
  console.log('  receiver:', htlcResult[2]);
  console.log('  claimed:', htlcResult[6]);

  // Test secret
  const secret = "test123";
  const secretFelt = cairo.felt(secret);
  console.log('\nSecret "test123":');
  console.log('  As felt:', secretFelt);
  console.log('  As hex:', '0x' + BigInt(secretFelt).toString(16));

  // Compute hash
  const computedHash = pedersen(secretFelt, 0);
  console.log('\nComputed hash:', computedHash);
  console.log('Stored hash_lock:', htlcResult[0]);
  console.log('Do they match?', computedHash === htlcResult[0]);

  // Try to claim
  console.log('\n🔄 Attempting claim...');
  try {
    const calldata = CallData.compile({ secret: secretFelt });
    console.log('Calldata:', calldata);

    const tx = await account.execute({
      contractAddress: HTLC_CONTRACT_ADDRESS,
      entrypoint: 'claim',
      calldata: calldata,
    });

    console.log('✅ Claim transaction sent:', tx.transaction_hash);
    await provider.waitForTransaction(tx.transaction_hash);
    console.log('✅ Transaction confirmed!');
  } catch (error) {
    console.error('❌ Claim failed:', error.message || error);
  }
}

main().catch(console.error);
