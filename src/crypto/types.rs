//! Cryptographic types for BlackTrace

use crate::types::Hash;
use serde::{Deserialize, Serialize};

/// Nullifier prevents reuse of the same liquidity proof
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Nullifier(pub [u8; 32]);

impl Nullifier {
    /// Create nullifier from bytes
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Nullifier(bytes)
    }

    /// Get nullifier as hex string
    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }

    /// Create nullifier from hex string
    pub fn from_hex(hex_str: &str) -> Result<Self, hex::FromHexError> {
        let bytes = hex::decode(hex_str)?;
        if bytes.len() != 32 {
            return Err(hex::FromHexError::InvalidStringLength);
        }
        let mut nullifier = [0u8; 32];
        nullifier.copy_from_slice(&bytes);
        Ok(Nullifier(nullifier))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nullifier_hex_conversion() {
        let bytes = [42u8; 32];
        let nullifier = Nullifier::from_bytes(bytes);

        let hex = nullifier.to_hex();
        let nullifier_from_hex = Nullifier::from_hex(&hex).unwrap();

        assert_eq!(nullifier, nullifier_from_hex);
    }

    #[test]
    fn test_nullifier_serialization() {
        let nullifier = Nullifier([123u8; 32]);
        let serialized = serde_json::to_string(&nullifier).unwrap();
        let deserialized: Nullifier = serde_json::from_str(&serialized).unwrap();
        assert_eq!(nullifier, deserialized);
    }

    #[test]
    fn test_commitment_serialization() {
        let commitment = LiquidityCommitment {
            commitment_hash: Hash::from_bytes(b"test"),
            nullifier: Nullifier([1u8; 32]),
            min_amount: 10000,
            timestamp: 1234567890,
        };

        let serialized = serde_json::to_string(&commitment).unwrap();
        let deserialized: LiquidityCommitment = serde_json::from_str(&serialized).unwrap();
        assert_eq!(commitment.min_amount, deserialized.min_amount);
    }
}
