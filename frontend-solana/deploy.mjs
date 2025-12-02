import { Account, RpcProvider, Contract, json, CallData } from 'starknet';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';
const DEPLOYER = {
  address: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
  privateKey: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
};

async function main() {
  console.log('🚀 Deploying HTLC contract...\n');

  // Initialize provider and account
  const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });
  const account = new Account({
    provider,
    address: DEPLOYER.address,
    signer: DEPLOYER.privateKey,
  });

  console.log('📝 Deployer account:', DEPLOYER.address);

  // Read compiled contract (Sierra and CASM)
  const sierraPath = join(__dirname, '../starknet-contracts/target/dev/blacktrace_htlc_HTLC.contract_class.json');
  const casmPath = join(__dirname, '../starknet-contracts/target/dev/blacktrace_htlc_HTLC.compiled_contract_class.json');
  const compiledContract = json.parse(readFileSync(sierraPath, 'utf8'));
  const compiledCasm = json.parse(readFileSync(casmPath, 'utf8'));

  // Declare the contract
  console.log('\n📤 Declaring contract...');
  try {
    const declareResponse = await account.declare({
      contract: compiledContract,
      casm: compiledCasm,
    });

    await provider.waitForTransaction(declareResponse.transaction_hash);
    console.log('✅ Contract declared');
    console.log('   Class hash:', declareResponse.class_hash);
    console.log('   Tx hash:', declareResponse.transaction_hash);

    // Deploy the contract
    console.log('\n🏗️  Deploying contract...');
    const deployResponse = await account.deploy({
      classHash: declareResponse.class_hash,
      constructorCalldata: [],
    });

    await provider.waitForTransaction(deployResponse.transaction_hash);
    console.log('✅ Contract deployed');
    console.log('   Contract address:', deployResponse.contract_address);
    console.log('   Tx hash:', deployResponse.transaction_hash);

    console.log('\n🎉 Deployment complete!');
    console.log('\n📋 Update frontend/src/lib/starknet.tsx:');
    console.log(`   HTLC_CONTRACT_ADDRESS = '${deployResponse.contract_address}';`);

  } catch (error) {
    if (error.message?.includes('already been declared')) {
      console.log('ℹ️  Contract already declared, deploying existing class...');

      // Extract class hash from error or use the known one
      const classHash = '0x0585775febf7abfc204f6fe3c370ef3d69ac645b9d06d2902cc4d141b4935aa6';

      console.log('\n🏗️  Deploying contract...');
      const deployResponse = await account.deploy({
        classHash: classHash,
        constructorCalldata: [],
      });

      await provider.waitForTransaction(deployResponse.transaction_hash);
      console.log('✅ Contract deployed');
      console.log('   Contract address:', deployResponse.contract_address);
      console.log('   Tx hash:', deployResponse.transaction_hash);

      console.log('\n🎉 Deployment complete!');
      console.log('\n📋 Update frontend/src/lib/starknet.tsx:');
      console.log(`   HTLC_CONTRACT_ADDRESS = '${deployResponse.contract_address}';`);
    } else {
      console.error('❌ Error:', error.message || error);
      process.exit(1);
    }
  }
}

main().catch(console.error);
