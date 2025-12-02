import { Account, RpcProvider, Contract, CallData } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const HTLC_CONTRACT_ADDRESS = '0x59cdce87f46c682ebedc1c5d7cfe2823110f84c54213f860944ef11c0b3ca7c';

const BOB = {
  address: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
  privateKey: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
};

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });
  const account = new Account({
    provider,
    address: BOB.address,
    signer: BOB.privateKey,
  });

  console.log('🧪 Testing STRK Token Transfer Functions\n');

  // Test 1: Check Bob's current allowance for HTLC contract
  console.log('1️⃣ Checking current allowance...');
  try {
    const allowanceResult = await provider.callContract({
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: 'allowance',
      calldata: CallData.compile({
        owner: BOB.address,
        spender: HTLC_CONTRACT_ADDRESS,
      }),
    });

    const allowanceLow = BigInt(allowanceResult[0] || '0');
    const allowanceHigh = BigInt(allowanceResult[1] || '0');
    const allowance = allowanceLow + (allowanceHigh << 128n);

    console.log('   Current allowance:', allowance.toString());
    console.log('   Allowance (STRK):', Number(allowance) / 1e18);

    if (allowance === 0n) {
      console.log('   ❌ No allowance! This is why transfer_from failed.');
    } else {
      console.log('   ✅ Allowance exists');
    }
  } catch (error) {
    console.error('   ❌ Error checking allowance:', error.message);
  }

  // Test 2: Check Bob's balance
  console.log('\n2️⃣ Checking Bob\'s STRK balance...');
  try {
    const balanceResult = await provider.callContract({
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: 'balanceOf',
      calldata: CallData.compile({ account: BOB.address }),
    });

    const balanceLow = BigInt(balanceResult[0] || '0');
    const balanceHigh = BigInt(balanceResult[1] || '0');
    const balance = balanceLow + (balanceHigh << 128n);

    console.log('   Balance:', balance.toString());
    console.log('   Balance (STRK):', Number(balance) / 1e18);
  } catch (error) {
    console.error('   ❌ Error checking balance:', error.message);
  }

  // Test 3: Try a small approve + transfer_from test
  console.log('\n3️⃣ Testing approve + transfer flow...');
  const testAmount = 1n; // 1 wei

  try {
    console.log('   Approving HTLC contract for 1 wei...');
    const approveTx = await account.execute({
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: 'approve',
      calldata: CallData.compile({
        spender: HTLC_CONTRACT_ADDRESS,
        amount: { low: testAmount, high: 0n },
      }),
    });
    await provider.waitForTransaction(approveTx.transaction_hash);
    console.log('   ✅ Approval tx:', approveTx.transaction_hash);

    // Check allowance again
    const allowanceResult2 = await provider.callContract({
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: 'allowance',
      calldata: CallData.compile({
        owner: BOB.address,
        spender: HTLC_CONTRACT_ADDRESS,
      }),
    });
    const allowance2 = BigInt(allowanceResult2[0] || '0') + (BigInt(allowanceResult2[1] || '0') << 128n);
    console.log('   New allowance:', allowance2.toString());

    if (allowance2 >= testAmount) {
      console.log('   ✅ Allowance set correctly!');
    } else {
      console.log('   ❌ Allowance not set properly');
    }

  } catch (error) {
    console.error('   ❌ Error in test:', error.message);
  }
}

main().catch(console.error);
