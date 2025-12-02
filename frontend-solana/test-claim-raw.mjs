import { Account, RpcProvider, cairo } from 'starknet';
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

  const secret = "test123";
  const secretFelt = cairo.felt(secret);

  console.log('Testing different calldata formats for secret:', secret);
  console.log('Secret as felt:', secretFelt);
  console.log('Secret as hex:', '0x' + BigInt(secretFelt).toString(16));
  console.log('Expected hash:', pedersen(secretFelt, 0));

  // Try 1: Using the felt as a string
  console.log('\n🔄 Test 1: Sending felt as string');
  try {
    const tx1 = await account.execute({
      contractAddress: HTLC_CONTRACT_ADDRESS,
      entrypoint: 'claim',
      calldata: [secretFelt.toString()],
    });
    console.log('✅ Success! Tx:', tx1.transaction_hash);
    await provider.waitForTransaction(tx1.transaction_hash);
    console.log('✅ Confirmed!');
    return;
  } catch (error) {
    console.log('❌ Failed:', error.message.includes('Invalid secret') ? 'Invalid secret' : error.message);
  }

  // Try 2: Using the hex representation
  console.log('\n🔄 Test 2: Sending as hex');
  try {
    const tx2 = await account.execute({
      contractAddress: HTLC_CONTRACT_ADDRESS,
      entrypoint: 'claim',
      calldata: ['0x' + BigInt(secretFelt).toString(16)],
    });
    console.log('✅ Success! Tx:', tx2.transaction_hash);
    await provider.waitForTransaction(tx2.transaction_hash);
    console.log('✅ Confirmed!');
    return;
  } catch (error) {
    console.log('❌ Failed:', error.message.includes('Invalid secret') ? 'Invalid secret' : error.message);
  }

  // Try 3: Send the actual ASCII hex bytes
  console.log('\n🔄 Test 3: Sending ASCII bytes as hex');
  const asciiHex = '0x74657374313233';  // "test123" in ASCII hex
  try {
    const tx3 = await account.execute({
      contractAddress: HTLC_CONTRACT_ADDRESS,
      entrypoint: 'claim',
      calldata: [asciiHex],
    });
    console.log('✅ Success! Tx:', tx3.transaction_hash);
    await provider.waitForTransaction(tx3.transaction_hash);
    console.log('✅ Confirmed!');
    return;
  } catch (error) {
    console.log('❌ Failed:', error.message.includes('Invalid secret') ? 'Invalid secret' : error.message);
  }

  console.log('\n❌ All attempts failed!');
}

main().catch(console.error);
