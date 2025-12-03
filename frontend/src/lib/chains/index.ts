/**
 * Chain Abstraction Layer - Index
 *
 * Export all chain providers and utilities for easy import.
 */

// Types and utilities
export * from './types';

// Solana chain provider
export * from './solana';

// Re-export Starknet from its original location for backward compatibility
// Note: Starknet provider is still in ../starknet.tsx
// We export it here for consistency with the new chain abstraction
export {
  MakerStarknetProvider,
  TakerStarknetProvider,
  useMakerStarknet,
  useTakerStarknet,
  useStarknet,
  StarknetProvider,
} from '../starknet';
