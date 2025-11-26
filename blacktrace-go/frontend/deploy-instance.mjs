import { Account, RpcProvider } from 'starknet';

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const DEPLOYER = {
  address: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
  privateKey: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
};

const CLASS_HASH = '0x7a70dcfc37ce58c00b8a6f652206fd09520674eaaec793b0b3008c5ea6b36d';

async function main() {
  console.log('🚀 Deploying new HTLC contract instance...\n');

  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });
  const account = new Account({
    provider,
    address: DEPLOYER.address,
    signer: DEPLOYER.privateKey,
  });

  try {
    console.log('🏗️  Deploying contract...');
    const deployResponse = await account.deployContract({
      classHash: CLASS_HASH,
      constructorCalldata: [],
    });

    await provider.waitForTransaction(deployResponse.transaction_hash);
    console.log('✅ Contract deployed');
    console.log('   Contract address:', deployResponse.contract_address[0]);
    console.log('   Tx hash:', deployResponse.transaction_hash);

    console.log('\n🎉 Deployment complete!');
    console.log('\n📋 Update frontend/src/lib/starknet.tsx:');
    console.log(`   HTLC_CONTRACT_ADDRESS = '${deployResponse.contract_address[0]}';`);

  } catch (error) {
    console.error('❌ Error:', error.message || error);
    process.exit(1);
  }
}

main().catch(console.error);
