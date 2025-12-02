import { cairo } from 'starknet';
import { pedersen } from '@scure/starknet';

const secret = "test123";

// Lock side: compute hash
const secretFelt = cairo.felt(secret);
console.log('Secret as felt:', secretFelt);
console.log('Secret as felt (hex):', '0x' + BigInt(secretFelt).toString(16));

const hashLock = pedersen(secretFelt, '0');
console.log('Hash lock:', hashLock);

// Claim side: just send the felt
const claimSecretFelt = cairo.felt(secret);
console.log('\nClaim secret felt:', claimSecretFelt);
console.log('Claim secret felt (hex):', '0x' + BigInt(claimSecretFelt).toString(16));

// Verify they match
console.log('\nDo they match?', secretFelt === claimSecretFelt);

// Now test if contract would compute the same hash
const contractHash = pedersen(claimSecretFelt, '0');
console.log('Contract would compute hash:', contractHash);
console.log('Hashes match?', hashLock === contractHash);
