import { Account, RpcProvider, Contract, CallData, hash, cairo } from 'starknet';
import { readFileSync } from 'fs';

const HTLC_ABI = JSON.parse(readFileSync('./src/lib/htlc-abi.json', 'utf-8'));

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const NEW_HTLC_ADDRESS = '0x8d55e048d8d4a7b8242a6f9543e8864679f00741cf8020e0aed9fc16ac9fc7';
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

const BOB = {
  address: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
  privateKey: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
};

const ALICE = {
  address: '0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1',
  privateKey: '0x000000000000000000000000000000000e1406455b7d66b1690803be066cbe5e',
};

async function getBalance(provider, address) {
  const result = await provider.callContract({
    contractAddress: STRK_TOKEN_ADDRESS,
    entrypoint: 'balanceOf',
    calldata: CallData.compile({ account: address }),
  });
  const low = BigInt(result[0] || '0');
  const high = BigInt(result[1] || '0');
  return low + (high << 128n);
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });
  const bobAccount = new Account({ provider, address: BOB.address, signer: BOB.privateKey });
  const aliceAccount = new Account({ provider, address: ALICE.address, signer: ALICE.privateKey });

  console.log('🧪 Testing End-to-End Token Transfers with HTLC\n');

  // Test parameters
  const secret = 'mysecret123';
  const secretFelt = cairo.felt(secret);
  const hashLock = hash.computePedersenHash(secretFelt, '0');
  const amount = 100n * (10n ** 18n);  // 100 STRK
  const amountLow = amount & ((1n << 128n) - 1n);
  const amountHigh = amount >> 128n;
  const timeout = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  console.log('📊 Step 1: Check initial balances\n');

  const bobBalanceInitial = await getBalance(provider, BOB.address);
  const aliceBalanceInitial = await getBalance(provider, ALICE.address);
  const htlcBalanceInitial = await getBalance(provider, NEW_HTLC_ADDRESS);

  console.log('   Bob:', Number(bobBalanceInitial) / 1e18, 'STRK');
  console.log('   Alice:', Number(aliceBalanceInitial) / 1e18, 'STRK');
  console.log('   HTLC Contract:', Number(htlcBalanceInitial) / 1e18, 'STRK');

  // Step 2: Bob approves HTLC
  console.log('\n✍️  Step 2: Bob approves HTLC contract\n');

  const approveTx = await bobAccount.execute({
    contractAddress: STRK_TOKEN_ADDRESS,
    entrypoint: 'approve',
    calldata: CallData.compile({
      spender: NEW_HTLC_ADDRESS,
      amount: { low: amountLow, high: amountHigh },
    }),
  });
  await provider.waitForTransaction(approveTx.transaction_hash);
  console.log('   ✅ Approval confirmed:', approveTx.transaction_hash);

  // Step 3: Bob locks funds
  console.log('\n🔒 Step 3: Bob locks 100 STRK\n');

  try {
    const lockTx = await bobAccount.execute({
      contractAddress: NEW_HTLC_ADDRESS,
      entrypoint: 'lock',
      calldata: CallData.compile({
        hash_lock: hashLock,
        receiver: ALICE.address,
        timeout: timeout,
        amount: { low: amountLow, high: amountHigh },
      }),
    });
    await provider.waitForTransaction(lockTx.transaction_hash);
    console.log('   ✅ Lock confirmed:', lockTx.transaction_hash);
  } catch (error) {
    console.error('   ❌ Lock failed:', error.message);
    console.log('\n   This means the contract still does not have transfer logic,');
    console.log('   or there is an issue with the transfer_from call.');
    return;
  }

  // Step 4: Check balances after lock
  console.log('\n📊 Step 4: Check balances after lock\n');

  const bobBalanceAfterLock = await getBalance(provider, BOB.address);
  const aliceBalanceAfterLock = await getBalance(provider, ALICE.address);
  const htlcBalanceAfterLock = await getBalance(provider, NEW_HTLC_ADDRESS);

  console.log('   Bob:', Number(bobBalanceAfterLock) / 1e18, 'STRK', `(${Number(bobBalanceAfterLock - bobBalanceInitial) / 1e18 > 0 ? '+' : ''}${Number(bobBalanceAfterLock - bobBalanceInitial) / 1e18})`);
  console.log('   Alice:', Number(aliceBalanceAfterLock) / 1e18, 'STRK', `(${Number(aliceBalanceAfterLock - aliceBalanceInitial) / 1e18 > 0 ? '+' : ''}${Number(aliceBalanceAfterLock - aliceBalanceInitial) / 1e18})`);
  console.log('   HTLC Contract:', Number(htlcBalanceAfterLock) / 1e18, 'STRK', `(${Number(htlcBalanceAfterLock - htlcBalanceInitial) / 1e18 > 0 ? '+' : ''}${Number(htlcBalanceAfterLock - htlcBalanceInitial) / 1e18})`);

  if (htlcBalanceAfterLock === htlcBalanceInitial) {
    console.log('\n   ❌ PROBLEM: HTLC balance did not increase!');
    console.log('      The transfer_from call in lock() is not working.');
    return;
  }

  console.log('\n   ✅ Token transfer to HTLC contract successful!');

  // Step 5: Alice claims funds
  console.log('\n🎁 Step 5: Alice claims with secret\n');

  try {
    const claimTx = await aliceAccount.execute({
      contractAddress: NEW_HTLC_ADDRESS,
      entrypoint: 'claim',
      calldata: CallData.compile({ secret: secretFelt }),
    });
    await provider.waitForTransaction(claimTx.transaction_hash);
    console.log('   ✅ Claim confirmed:', claimTx.transaction_hash);
  } catch (error) {
    console.error('   ❌ Claim failed:', error.message);
    return;
  }

  // Step 6: Check final balances
  console.log('\n📊 Step 6: Check final balances\n');

  const bobBalanceFinal = await getBalance(provider, BOB.address);
  const aliceBalanceFinal = await getBalance(provider, ALICE.address);
  const htlcBalanceFinal = await getBalance(provider, NEW_HTLC_ADDRESS);

  console.log('   Bob:', Number(bobBalanceFinal) / 1e18, 'STRK', `(${Number(bobBalanceFinal - bobBalanceInitial) / 1e18 > 0 ? '+' : ''}${Number(bobBalanceFinal - bobBalanceInitial) / 1e18})`);
  console.log('   Alice:', Number(aliceBalanceFinal) / 1e18, 'STRK', `(${Number(aliceBalanceFinal - aliceBalanceInitial) / 1e18 > 0 ? '+' : ''}${Number(aliceBalanceFinal - aliceBalanceInitial) / 1e18})`);
  console.log('   HTLC Contract:', Number(htlcBalanceFinal) / 1e18, 'STRK', `(${Number(htlcBalanceFinal - htlcBalanceInitial) / 1e18 > 0 ? '+' : ''}${Number(htlcBalanceFinal - htlcBalanceInitial) / 1e18})`);

  // Verify expected changes
  console.log('\n✅ Verification:');

  const bobChange = Number(bobBalanceFinal - bobBalanceInitial) / 1e18;
  const aliceChange = Number(aliceBalanceFinal - aliceBalanceInitial) / 1e18;
  const htlcChange = Number(htlcBalanceFinal - htlcBalanceInitial) / 1e18;

  // Allow for gas fees (Bob's balance should be ~-100 minus gas)
  const bobExpectedRange = bobChange < -99 && bobChange > -110;
  const aliceExpectedExact = Math.abs(aliceChange - 100) < 0.01;
  const htlcExpectedExact = Math.abs(htlcChange) < 0.01;

  console.log('   Bob lost ~100 STRK (+ gas):', bobExpectedRange ? '✅' : '❌', `(actual: ${bobChange.toFixed(2)})`);
  console.log('   Alice gained 100 STRK:', aliceExpectedExact ? '✅' : '❌', `(actual: ${aliceChange.toFixed(2)})`);
  console.log('   HTLC balance returned to 0:', htlcExpectedExact ? '✅' : '❌', `(actual: ${htlcChange.toFixed(2)})`);

  if (bobExpectedRange && aliceExpectedExact && htlcExpectedExact) {
    console.log('\n🎉 SUCCESS! All token transfers work correctly!');
    console.log('   The HTLC contract now properly handles STRK token transfers.');
  } else {
    console.log('\n⚠️  Some transfers did not work as expected.');
  }
}

main().catch(console.error);
