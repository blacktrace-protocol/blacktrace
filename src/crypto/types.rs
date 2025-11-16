//! Cryptographic types for BlackTrace

use serde::{Deserialize, Serialize};

/// 32-byte hash value (Blake2b-256 output)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Hash([u8; 32]);

impl Hash {
    /// Create hash from byte array
    pub fn from_bytes(bytes: &[u8]) -> Self {
        let mut hash = [0u8; 32];
        let len = bytes.len().min(32);
        hash[..len].copy_from_slice(&bytes[..len]);
        Hash(hash)
    }

    /// Get hash as byte slice
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Convert to hex string
    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }
}

/// 32-byte random salt for commitments
pub type Salt = [u8; 32];

/// Viewing key for generating nullifiers
pub type ViewingKey = Vec<u8>;

/// Nullifier prevents reuse of the same liquidity proof
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Nullifier(pub Hash);

impl Nullifier {
    /// Create nullifier from hash
    pub fn new(hash: Hash) -> Self {
        Nullifier(hash)
    }

    /// Get nullifier as hex string
    pub fn to_hex(&self) -> String {
        self.0.to_hex()
    }
}

/// Liquidity commitment proves you have funds without revealing the amount
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LiquidityCommitment {
    /// Hash commitment to the actual amount and salt
    pub commitment_hash: Hash,
    /// Nullifier prevents reuse of this commitment
    pub nullifier: Nullifier,
    /// Minimum amount being claimed (public)
    pub min_amount: u64,
    /// Timestamp of commitment creation
    pub timestamp: u64,
}

/// Commitment opening reveals the committed values
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CommitmentOpening {
    /// Actual amount committed
    pub amount: u64,
    /// Random salt used in commitment
    pub salt: [u8; 32],
}
