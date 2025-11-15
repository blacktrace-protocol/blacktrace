//! Core types used throughout BlackTrace

use blake2::{Blake2b512, Digest};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

/// Unique identifier for orders (timestamp-based)
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct OrderID(pub String);

impl OrderID {
    /// Generate a new unique order ID with timestamp
    pub fn generate() -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis();

        Self(format!("order_{}", timestamp))
    }
}

impl fmt::Display for OrderID {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Peer identifier in P2P network (derived from public key hash)
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PeerID(pub String);

impl PeerID {
    /// Create PeerID from public key bytes
    pub fn from_pubkey(pubkey: &[u8]) -> Self {
        let mut hasher = Blake2b512::new();
        hasher.update(pubkey);
        let result = hasher.finalize();
        Self(hex::encode(&result[..16])) // Use first 16 bytes
    }
}

impl fmt::Display for PeerID {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Zcash transaction ID
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TxID(pub String);

impl fmt::Display for TxID {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Blake2b 256-bit hash wrapper
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Hash(pub [u8; 32]);

impl Hash {
    /// Create hash from bytes using Blake2b
    pub fn from_bytes(data: &[u8]) -> Self {
        let mut hasher = Blake2b512::new();
        hasher.update(data);
        let result = hasher.finalize();

        let mut hash = [0u8; 32];
        hash.copy_from_slice(&result[..32]);
        Hash(hash)
    }

    /// Get hash as hex string
    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }

    /// Create hash from hex string
    pub fn from_hex(hex_str: &str) -> Result<Self, hex::FromHexError> {
        let bytes = hex::decode(hex_str)?;
        if bytes.len() != 32 {
            return Err(hex::FromHexError::InvalidStringLength);
        }
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&bytes);
        Ok(Hash(hash))
    }
}

impl fmt::Display for Hash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_hex())
    }
}

/// Order type: Buy or Sell
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderType {
    Buy,
    Sell,
}

/// Supported stablecoins
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum StablecoinType {
    USDC,
    USDT,
    DAI,
}

/// Zcash network type
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ZcashNetwork {
    Mainnet,
    Testnet,
}

/// 32-byte secret preimage for HTLC
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SecretPreimage(pub [u8; 32]);

impl SecretPreimage {
    /// Generate a random secret
    pub fn random() -> Self {
        use rand::RngCore;
        let mut secret = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut secret);
        SecretPreimage(secret)
    }

    /// Compute hash of this secret
    pub fn hash(&self) -> Hash {
        Hash::from_bytes(&self.0)
    }

    /// Get secret as hex string
    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }

    /// Create secret from hex string
    pub fn from_hex(hex_str: &str) -> Result<Self, hex::FromHexError> {
        let bytes = hex::decode(hex_str)?;
        if bytes.len() != 32 {
            return Err(hex::FromHexError::InvalidStringLength);
        }
        let mut secret = [0u8; 32];
        secret.copy_from_slice(&bytes);
        Ok(SecretPreimage(secret))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_order_id_creation() {
        let id1 = OrderID::generate();

        // IDs should start with "order_"
        assert!(id1.0.starts_with("order_"));

        // Wait a tiny bit to ensure different timestamp
        std::thread::sleep(std::time::Duration::from_millis(2));

        let id2 = OrderID::generate();

        // IDs should be different (due to timestamp)
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_peer_id_from_pubkey() {
        let pubkey1 = b"test_public_key_1";
        let pubkey2 = b"test_public_key_2";

        let peer1 = PeerID::from_pubkey(pubkey1);
        let peer2 = PeerID::from_pubkey(pubkey2);

        // Different pubkeys should produce different peer IDs
        assert_ne!(peer1, peer2);

        // Same pubkey should produce same peer ID (deterministic)
        let peer1_again = PeerID::from_pubkey(pubkey1);
        assert_eq!(peer1, peer1_again);
    }

    #[test]
    fn test_hash_consistency() {
        let data = b"test data";

        let hash1 = Hash::from_bytes(data);
        let hash2 = Hash::from_bytes(data);

        // Hashing should be deterministic
        assert_eq!(hash1, hash2);

        // Different data should produce different hashes
        let hash3 = Hash::from_bytes(b"different data");
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_secret_preimage() {
        // Test random generation
        let secret1 = SecretPreimage::random();
        let secret2 = SecretPreimage::random();

        // Random secrets should be different
        assert_ne!(secret1, secret2);

        // Test hashing
        let hash1 = secret1.hash();
        let hash2 = secret1.hash();

        // Hashing should be deterministic
        assert_eq!(hash1, hash2);

        // Different secrets should produce different hashes
        let hash3 = secret2.hash();
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_serialization() {
        let order_id = OrderID::generate();
        let serialized = serde_json::to_string(&order_id).unwrap();
        let deserialized: OrderID = serde_json::from_str(&serialized).unwrap();
        assert_eq!(order_id, deserialized);

        let secret = SecretPreimage::random();
        let serialized = serde_json::to_string(&secret).unwrap();
        let deserialized: SecretPreimage = serde_json::from_str(&serialized).unwrap();
        assert_eq!(secret, deserialized);
    }

    #[test]
    fn test_hash_hex_conversion() {
        let data = b"test data";
        let hash = Hash::from_bytes(data);

        let hex = hash.to_hex();
        let hash_from_hex = Hash::from_hex(&hex).unwrap();

        assert_eq!(hash, hash_from_hex);
    }
}
