import { Account, RpcProvider, Contract, json } from 'starknet';
import { readFileSync } from 'fs';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';

// Bob will deploy the contract
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

  console.log('📦 Deploying new HTLC contract with token transfers\n');

  // Read the compiled contract
  const compiledContract = json.parse(
    readFileSync('../starknet-contracts/target/dev/blacktrace_htlc_HTLC.contract_class.json', 'utf-8')
  );
  const compiledCasm = json.parse(
    readFileSync('../starknet-contracts/target/dev/blacktrace_htlc_HTLC.compiled_contract_class.json', 'utf-8')
  );

  console.log('1️⃣  Declaring contract class...');
  try {
    const declareResponse = await account.declare({
      contract: compiledContract,
      casm: compiledCasm,
    });

    console.log('   Class hash:', declareResponse.class_hash);
    console.log('   Declare tx:', declareResponse.transaction_hash);

    await provider.waitForTransaction(declareResponse.transaction_hash);
    console.log('   ✅ Declaration confirmed');

    // Deploy the contract
    console.log('\n2️⃣  Deploying contract instance...');
    const deployResponse = await account.deployContract({
      classHash: declareResponse.class_hash,
      constructorCalldata: [],
    });

    console.log('   Contract address:', deployResponse.contract_address);
    console.log('   Deploy tx:', deployResponse.transaction_hash);

    await provider.waitForTransaction(deployResponse.transaction_hash);
    console.log('   ✅ Deployment confirmed');

    console.log('\n✅ SUCCESS!');
    console.log('\n📋 Update the following in your frontend:');
    console.log(`   HTLC_CONTRACT_ADDRESS = '${deployResponse.contract_address}'`);
    console.log('\n💡 Next steps:');
    console.log('   1. Update frontend/src/lib/starknet.tsx with new address');
    console.log('   2. Test lock-claim flow with actual token transfers');

  } catch (error) {
    if (error.message?.includes('is already declared')) {
      console.log('   ℹ️  Class already declared, attempting deployment...');

      // Extract class hash from error if possible, or we need to compute it
      console.log('\n   Please run starkli class-hash to get the class hash');
      console.log('   Or redeploy after recompiling the contract');
    } else {
      console.error('   ❌ Error:', error.message);
      throw error;
    }
  }
}

main().catch(console.error);
