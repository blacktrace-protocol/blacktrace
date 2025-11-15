//! Commitment scheme for zero-knowledge liquidity proofs

use crate::error::{BlackTraceError, Result};
use crate::types::{Hash, OrderID};
use blake2::{Blake2b512, Digest};
use rand::RngCore;

use super::types::{CommitmentOpening, LiquidityCommitment, Nullifier};

/// Generate a liquidity commitment
pub fn generate_commitment(
    amount: u64,
    salt: &[u8; 32],
    min_amount: u64,
    viewing_key: &[u8],
    order_id: &OrderID,
) -> Result<LiquidityCommitment> {
    // Verify amount meets minimum
    if amount < min_amount {
        return Err(BlackTraceError::InsufficientBalance {
            required: min_amount,
            available: amount,
        });
    }

    // Generate commitment hash: Hash(amount || salt)
    let commitment_hash = compute_commitment_hash(amount, salt);

    // Generate nullifier: Hash(viewing_key || order_id)
    let nullifier = generate_nullifier(viewing_key, order_id);

    // Create commitment
    let commitment = LiquidityCommitment {
        commitment_hash,
        nullifier,
        min_amount,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    };

    Ok(commitment)
}

/// Compute commitment hash from amount and salt
pub fn compute_commitment_hash(amount: u64, salt: &[u8; 32]) -> Hash {
    let mut hasher = Blake2b512::new();
    hasher.update(amount.to_be_bytes());
    hasher.update(salt);
    let result = hasher.finalize();

    let mut hash = [0u8; 32];
    hash.copy_from_slice(&result[..32]);
    Hash(hash)
}

/// Generate nullifier from viewing key and order ID
pub fn generate_nullifier(viewing_key: &[u8], order_id: &OrderID) -> Nullifier {
    let mut hasher = Blake2b512::new();
    hasher.update(viewing_key);
    hasher.update(order_id.0.as_bytes());
    let result = hasher.finalize();

    let mut nullifier = [0u8; 32];
    nullifier.copy_from_slice(&result[..32]);
    Nullifier(nullifier)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commitment_generation() {
        let amount = 10000u64;
        let salt = generate_random_salt();
        let min_amount = 5000u64;
        let viewing_key = b"test_viewing_key";
        let order_id = OrderID::generate();

        let commitment =
            generate_commitment(amount, &salt, min_amount, viewing_key, &order_id).unwrap();

        assert_eq!(commitment.min_amount, min_amount);
        assert!(commitment.timestamp > 0);
    }

    #[test]
    fn test_commitment_verification() {
        let amount = 10000u64;
        let salt = generate_random_salt();
        let min_amount = 5000u64;
        let viewing_key = b"test_viewing_key";
        let order_id = OrderID::generate();

        let commitment =
            generate_commitment(amount, &salt, min_amount, viewing_key, &order_id).unwrap();

        let opening = CommitmentOpening { amount, salt };

        // Correct opening should verify
        assert!(verify_commitment(&commitment, &opening));
    }

    #[test]
    fn test_commitment_verification_fails_wrong_amount() {
        let amount = 10000u64;
        let salt = generate_random_salt();
        let min_amount = 5000u64;
        let viewing_key = b"test_viewing_key";
        let order_id = OrderID::generate();

        let commitment =
            generate_commitment(amount, &salt, min_amount, viewing_key, &order_id).unwrap();

        // Wrong amount
        let wrong_opening = CommitmentOpening {
            amount: 8000,
            salt,
        };

        assert!(!verify_commitment(&commitment, &wrong_opening));
    }

    #[test]
    fn test_commitment_verification_fails_wrong_salt() {
        let amount = 10000u64;
        let salt = generate_random_salt();
        let min_amount = 5000u64;
        let viewing_key = b"test_viewing_key";
        let order_id = OrderID::generate();

        let commitment =
            generate_commitment(amount, &salt, min_amount, viewing_key, &order_id).unwrap();

        // Wrong salt
        let wrong_opening = CommitmentOpening {
            amount,
            salt: generate_random_salt(),
        };

        assert!(!verify_commitment(&commitment, &wrong_opening));
    }

    #[test]
    fn test_commitment_hash_deterministic() {
        let amount = 12345u64;
        let salt = [42u8; 32];

        let hash1 = compute_commitment_hash(amount, &salt);
        let hash2 = compute_commitment_hash(amount, &salt);

        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_nullifier_uniqueness() {
        let viewing_key = b"test_key";
        let order1 = OrderID::generate();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let order2 = OrderID::generate();

        let nullifier1 = generate_nullifier(viewing_key, &order1);
        let nullifier2 = generate_nullifier(viewing_key, &order2);

        // Different orders should produce different nullifiers
        assert_ne!(nullifier1, nullifier2);
    }

    #[test]
    fn test_nullifier_deterministic() {
        let viewing_key = b"test_key";
        let order_id = OrderID::generate();

        let nullifier1 = generate_nullifier(viewing_key, &order_id);
        let nullifier2 = generate_nullifier(viewing_key, &order_id);

        // Same inputs should produce same nullifier
        assert_eq!(nullifier1, nullifier2);
    }

    #[test]
    fn test_insufficient_balance() {
        let amount = 5000u64;
        let salt = generate_random_salt();
        let min_amount = 10000u64; // More than available
        let viewing_key = b"test_viewing_key";
        let order_id = OrderID::generate();

        let result = generate_commitment(amount, &salt, min_amount, viewing_key, &order_id);

        assert!(matches!(
            result,
            Err(BlackTraceError::InsufficientBalance { .. })
        ));
    }
}
