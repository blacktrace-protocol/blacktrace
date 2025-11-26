import { cairo } from 'starknet';
import { pedersen } from '@scure/starknet';

const secret = "test123";
const secretFelt = cairo.felt(secret);

console.log('Secret felt:', secretFelt);
console.log('Secret felt (hex):', '0x' + BigInt(secretFelt).toString(16));

// Test with string '0'
const hash1 = pedersen(secretFelt, '0');
console.log('\nHash with pedersen(secretFelt, \'0\'):', hash1);

// Test with number 0
const hash2 = pedersen(secretFelt, 0);
console.log('Hash with pedersen(secretFelt, 0):', hash2);

// Test with BigInt 0n
const hash3 = pedersen(secretFelt, 0n);
console.log('Hash with pedersen(secretFelt, 0n):', hash3);

console.log('\nAre they all the same?', hash1 === hash2 && hash2 === hash3);
