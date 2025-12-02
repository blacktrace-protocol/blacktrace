// Polyfills for Solana libraries in browser environment
import { Buffer } from 'buffer';

// Make Buffer available globally
window.Buffer = Buffer;
(globalThis as any).Buffer = Buffer;

export {};
