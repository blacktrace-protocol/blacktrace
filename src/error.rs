//! Error types for BlackTrace

use thiserror::Error;

/// Main error type for BlackTrace
#[derive(Error, Debug)]
pub enum BlackTraceError {
    // Network errors
    #[error("Network connection error: {0}")]
    NetworkConnection(String),

    #[error("Message routing error: {0}")]
    MessageRouting(String),

    #[error("Network partition detected: {0}")]
    NetworkPartition(String),

    #[error("Peer not found: {0}")]
    PeerNotFound(String),

    #[error("Peer timeout: {0}")]
    PeerTimeout(String),

    // Cryptography errors
    #[error("Proof generation failed: {0}")]
    ProofGeneration(String),

    #[error("Proof verification failed: {0}")]
    ProofVerification(String),

    #[error("Encryption failed: {0}")]
    Encryption(String),

    #[error("Decryption failed: {0}")]
    Decryption(String),

    #[error("Invalid secret preimage")]
    InvalidSecret,

    #[error("Secret hash mismatch")]
    SecretHashMismatch,

    // Order management errors
    #[error("Insufficient balance: required {required}, available {available}")]
    InsufficientBalance { required: u64, available: u64 },

    #[error("Order not found: {0}")]
    OrderNotFound(String),

    #[error("Order already exists: {0}")]
    OrderAlreadyExists(String),

    #[error("Order expired: {0}")]
    OrderExpired(String),

    #[error("Nullifier already used: {0}")]
    NullifierReused(String),

    #[error("Invalid order state: {0}")]
    InvalidOrderState(String),

    // Negotiation errors
    #[error("Negotiation session not found: {0}")]
    SessionNotFound(String),

    #[error("Negotiation timeout: {0}")]
    NegotiationTimeout(String),

    #[error("Counterparty disconnected: {0}")]
    CounterpartyDisconnected(String),

    #[error("Invalid negotiation state transition: {0}")]
    InvalidStateTransition(String),

    #[error("Price proposal rejected: {0}")]
    ProposalRejected(String),

    #[error("Invalid proposal: {0}")]
    InvalidProposal(String),

    // Settlement errors
    #[error("Transaction broadcast failed: {0}")]
    TransactionBroadcast(String),

    #[error("Transaction not found: {0}")]
    TransactionNotFound(String),

    #[error("Timelock not expired")]
    TimelockNotExpired,

    #[error("Timelock expired")]
    TimelockExpired,

    #[error("Settlement already completed")]
    SettlementCompleted,

    #[error("Settlement failed: {0}")]
    SettlementFailed(String),

    #[error("Insufficient confirmations: {current}/{required}")]
    InsufficientConfirmations { current: u32, required: u32 },

    // State persistence errors
    #[error("Database error: {0}")]
    Database(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Deserialization error: {0}")]
    Deserialization(String),

    #[error("State corruption detected: {0}")]
    StateCorruption(String),

    // Configuration errors
    #[error("Configuration error: {0}")]
    Configuration(String),

    #[error("Invalid configuration value: {0}")]
    InvalidConfig(String),

    #[error("Missing configuration field: {0}")]
    MissingConfig(String),

    // RPC errors
    #[error("RPC connection error: {0}")]
    RpcConnection(String),

    #[error("RPC call failed: {0}")]
    RpcCallFailed(String),

    #[error("Invalid RPC response: {0}")]
    InvalidRpcResponse(String),

    // General errors
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Hex decode error: {0}")]
    HexDecode(#[from] hex::FromHexError),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Not implemented: {0}")]
    NotImplemented(String),
}

/// Result type alias for BlackTrace operations
pub type Result<T> = std::result::Result<T, BlackTraceError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_creation() {
        let err = BlackTraceError::OrderNotFound("order_123".to_string());
        assert_eq!(err.to_string(), "Order not found: order_123");
    }

    #[test]
    fn test_result_type() {
        fn sample_function() -> Result<u64> {
            Ok(42)
        }

        let result = sample_function();
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn test_error_conversion() {
        fn io_error_function() -> Result<()> {
            std::fs::read_to_string("/nonexistent/file")?;
            Ok(())
        }

        let result = io_error_function();
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), BlackTraceError::Io(_)));
    }

    #[test]
    fn test_insufficient_balance_error() {
        let err = BlackTraceError::InsufficientBalance {
            required: 10000,
            available: 5000,
        };
        assert_eq!(
            err.to_string(),
            "Insufficient balance: required 10000, available 5000"
        );
    }

    #[test]
    fn test_insufficient_confirmations_error() {
        let err = BlackTraceError::InsufficientConfirmations {
            current: 3,
            required: 6,
        };
        assert_eq!(
            err.to_string(),
            "Insufficient confirmations: 3/6"
        );
    }
}
