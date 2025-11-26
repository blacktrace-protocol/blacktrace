import { Account, RpcProvider, hash, CallData } from 'starknet';
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
  const compiledContract = JSON.parse(
    readFileSync('../starknet-contracts/target/dev/blacktrace_htlc_HTLC.contract_class.json', 'utf-8')
  );

  // Compute class hash
  const classHash = hash.computeContractClassHash(compiledContract);
  console.log('Class hash:', classHash);

  // Deploy using Universal Deployer Contract (UDC)
  console.log('\nDeploying contract instance...');

  try {
    const deployResponse = await account.deployContract({
      classHash: classHash,
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
    console.error('   ❌ Error:', error.message);
    throw error;
  }
}

main().catch(console.error);
