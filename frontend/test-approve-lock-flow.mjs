import { Account, RpcProvider, Contract, CallData, cairo } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const HTLC_CONTRACT_ADDRESS = '0x59cdce87f46c682ebedc1c5d7cfe2823110f84c54213f860944ef11c0b3ca7c';

const BOB = {
  address: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
  privateKey: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
};

async function checkAllowance(provider) {
  console.log('📊 Checking current allowance...');
  const result = await provider.callContract({
    contractAddress: STRK_TOKEN_ADDRESS,
    entrypoint: 'allowance',
    calldata: CallData.compile({
      owner: BOB.address,
      spender: HTLC_CONTRACT_ADDRESS,
    }),
  });

  const low = BigInt(result[0] || '0');
  const high = BigInt(result[1] || '0');
  const allowance = low + (high << 128n);

  console.log(`   Allowance: ${allowance.toString()} (${Number(allowance) / 1e18} STRK)`);
  return allowance;
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });
  const account = new Account({
    provider,
    address: BOB.address,
    signer: BOB.privateKey,
  });

  console.log('🧪 Testing Full Approve + Lock Flow\n');

  // Test amount: 100 STRK
  const amount = 100n * (10n ** 18n);
  const amountLow = amount & ((1n << 128n) - 1n);
  const amountHigh = amount >> 128n;

  console.log('Amount:', amount.toString(), `(${Number(amount) / 1e18} STRK)`);
  console.log('Amount (low, high):', amountLow.toString(), ',', amountHigh.toString());
  console.log('');

  // Step 1: Check initial allowance
  await checkAllowance(provider);
  console.log('');

  // Step 2: Approve HTLC contract
  console.log('✍️  Approving HTLC contract to spend', Number(amount) / 1e18, 'STRK...');
  try {
    const approveTx = await account.execute({
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: 'approve',
      calldata: CallData.compile({
        spender: HTLC_CONTRACT_ADDRESS,
        amount: { low: amountLow, high: amountHigh },
      }),
    });

    console.log('   Approve tx:', approveTx.transaction_hash);
    console.log('   Waiting for transaction...');

    await provider.waitForTransaction(approveTx.transaction_hash);
    console.log('   ✅ Approval confirmed');
  } catch (error) {
    console.error('   ❌ Approve failed:', error.message);
    return;
  }
  console.log('');

  // Step 3: Check allowance again
  const allowanceAfterApprove = await checkAllowance(provider);
  console.log('');

  if (allowanceAfterApprove < amount) {
    console.log('❌ PROBLEM: Allowance is less than expected!');
    console.log('   Expected:', amount.toString());
    console.log('   Got:', allowanceAfterApprove.toString());
    console.log('   This explains why transfer_from fails in the HTLC contract!');
  } else {
    console.log('✅ Allowance set correctly!');
  }

  console.log('\n📝 Note: The lock transaction would be called next, which would:');
  console.log('   1. Call STRK.transfer_from(Bob, HTLC, amount)');
  console.log('   2. This will consume the allowance');
  console.log('   3. If allowance < amount, transfer_from will fail');
}

main().catch(console.error);
