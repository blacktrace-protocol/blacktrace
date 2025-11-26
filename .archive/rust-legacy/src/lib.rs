//! BlackTrace Cryptography Library
//!
//! Zero-Knowledge cryptographic primitives for the BlackTrace protocol.
//!
//! This library provides cryptographic functions called by the Go application
//! via FFI/cgo for:
//! - Blake2b-based commitments for liquidity proofs
//! - Nullifier generation for double-spend prevention
//! - ZK proof verification (future)
//! - Zcash Orchard HTLC creation (future)

pub mod crypto;

// Re-export commonly used types and functions
pub use crypto::{
    CommitmentScheme, CommitmentOpening, Hash, LiquidityCommitment, Nullifier, Salt, ViewingKey,
    compute_commitment_hash, generate_commitment, generate_nullifier, generate_random_salt,
    verify_commitment,
};
