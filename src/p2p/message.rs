//! P2P message types for BlackTrace

use crate::types::{Hash, OrderID, OrderType, PeerID, StablecoinType};
use serde::{Deserialize, Serialize};

/// Network message envelope
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum NetworkMessage {
    /// Broadcast order announcement
    OrderAnnouncement(OrderAnnouncement),
    /// Request order details from maker
    OrderInterest(OrderInterest),
    /// Encrypted negotiation message
    NegotiationMessage(Vec<u8>),
    /// Settlement commitment
    SettlementCommit(Vec<u8>),
}

/// Public order announcement (broadcast to all peers)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderAnnouncement {
    pub order_id: OrderID,
    pub order_type: OrderType,
    pub stablecoin: StablecoinType,
    pub encrypted_details: Vec<u8>, // Encrypted order details
    pub proof_commitment: Hash,     // ZK proof commitment
    pub timestamp: u64,
    pub expiry: u64,
}

/// Request to get order details (sent directly to maker)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderInterest {
    pub order_id: OrderID,
    pub requester_peer_id: PeerID,
    pub encrypted_request: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_serialization() {
        let announcement = OrderAnnouncement {
            order_id: OrderID::generate(),
            order_type: OrderType::Sell,
            stablecoin: StablecoinType::USDC,
            encrypted_details: vec![1, 2, 3],
            proof_commitment: Hash::from_bytes(b"test"),
            timestamp: 1234567890,
            expiry: 1234567900,
        };

        let msg = NetworkMessage::OrderAnnouncement(announcement);
        let serialized = serde_json::to_string(&msg).unwrap();
        let deserialized: NetworkMessage = serde_json::from_str(&serialized).unwrap();

        match deserialized {
            NetworkMessage::OrderAnnouncement(_) => {}
            _ => panic!("Wrong message type"),
        }
    }
}
