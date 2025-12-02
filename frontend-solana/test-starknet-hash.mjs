import { hash, cairo } from 'starknet';
import { pedersen as scurePedersen } from '@scure/starknet';

const secret = "test123";
const secretFelt = cairo.felt(secret);

console.log('Secret "test123":');
console.log('  As felt:', secretFelt);
console.log('  As hex:', '0x' + BigInt(secretFelt).toString(16));

// Test @scure/starknet pedersen
const scureHash = scurePedersen(secretFelt, 0);
console.log('\n@scure/starknet pedersen(secret, 0):', scureHash);

// Test if starknet.js has a pedersen function
if (hash.computePedersenHash) {
  const starknetHash = hash.computePedersenHash(secretFelt, 0);
  console.log('starknet.js computePedersenHash:', starknetHash);
  console.log('Do they match?', scureHash === starknetHash);
} else {
  console.log('starknet.js does not have computePedersenHash');
}

// Check what's available in hash module
console.log('\nAvailable in starknet.hash:');
console.log(Object.keys(hash));
