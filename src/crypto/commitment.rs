//! Commitment scheme for zero-knowledge liquidity proofs

use blake2::{Blake2b512, Digest};
use rand::RngCore;

use super::types::{CommitmentOpening, Hash, LiquidityCommitment, Nullifier};

/// Generate a liquidity commitment
pub fn generate_commitment(
    amount: u64,
    salt: &[u8; 32],
    min_amount: u64,
    viewing_key: &[u8],
    order_id: &str,
) -> LiquidityCommitment {
    // Generate commitment hash: Hash(amount || salt)
    let commitment_hash = compute_commitment_hash(amount, salt);

    // Generate nullifier: Hash(viewing_key || order_id)
    let nullifier = generate_nullifier(viewing_key, order_id);

    // Create commitment
    LiquidityCommitment {
        commitment_hash,
        nullifier,
        min_amount,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    }
}

/// Compute commitment hash from amount and salt
pub fn compute_commitment_hash(amount: u64, salt: &[u8; 32]) -> Hash {
    let mut hasher = Blake2b512::new();
    hasher.update(amount.to_be_bytes());
    hasher.update(salt);
    let result = hasher.finalize();
    Hash::from_bytes(&result[..32])
}

/// Generate nullifier from viewing key and order ID
pub fn generate_nullifier(viewing_key: &[u8], order_id: &str) -> Nullifier {
    let mut hasher = Blake2b512::new();
    hasher.update(viewing_key);
    hasher.update(order_id.as_bytes());
    let result = hasher.finalize();
    let hash = Hash::from_bytes(&result[..32]);
    Nullifier::new(hash)
}

/// Verify a commitment opening
pub fn verify_commitment(
    commitment: &LiquidityCommitment,
    opening: &CommitmentOpening,
) -> bool {
    // Recompute commitment hash
    let computed_hash = compute_commitment_hash(opening.amount, &opening.salt);

    // Check if it matches
    if computed_hash != commitment.commitment_hash {
        return false;
    }

    // Check if amount meets minimum
    if opening.amount < commitment.min_amount {
        return false;
    }

    true
}

/// Generate random salt for commitments
pub fn generate_random_salt() -> [u8; 32] {
    let mut salt = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}

/// Commitment scheme trait (for future extensibility)
pub struct CommitmentScheme;

impl CommitmentScheme {
    /// Create a new commitment
    pub fn commit(
        amount: u64,
        salt: &[u8; 32],
        min_amount: u64,
        viewing_key: &[u8],
        order_id: &str,
    ) -> LiquidityCommitment {
        generate_commitment(amount, salt, min_amount, viewing_key, order_id)
    }

    /// Verify a commitment opening
    pub fn verify(commitment: &LiquidityCommitment, opening: &CommitmentOpening) -> bool {
        verify_commitment(commitment, opening)
    }

    /// Generate random salt
    pub fn random_salt() -> [u8; 32] {
        generate_random_salt()
    }
}
