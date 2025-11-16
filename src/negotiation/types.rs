//! Negotiation types and state machine

use crate::types::{Hash, OrderID, OrderType, StablecoinType};
use serde::{Deserialize, Serialize};
use std::time::SystemTime;

/// Role in negotiation
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Role {
    Maker,
    Taker,
}

/// Negotiation state machine
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum NegotiationState {
    /// Taker has requested order details
    DetailsRequested { timestamp: SystemTime },
    /// Maker has revealed order details
    DetailsRevealed {
        details: OrderDetails,
        timestamp: SystemTime,
    },
    /// Multi-round price discovery in progress
    PriceDiscovery { proposals: Vec<Proposal> },
    /// Both parties have agreed on terms
    TermsAgreed { settlement: SignedSettlement },
    /// Negotiation was cancelled
    Cancelled { reason: String },
}

impl NegotiationState {
    /// Check if negotiation is in a terminal state
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            NegotiationState::TermsAgreed { .. } | NegotiationState::Cancelled { .. }
        )
    }

    /// Check if negotiation is active
    pub fn is_active(&self) -> bool {
        !self.is_terminal()
    }
}

/// Order details revealed during negotiation
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderDetails {
    pub order_id: OrderID,
    pub order_type: OrderType,
    pub amount: u64,
    pub min_price: u64,
    pub max_price: u64,
    pub stablecoin: StablecoinType,
}

/// Price proposal during negotiation
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Proposal {
    pub price: u64,
    pub amount: u64,
    pub proposer: Role,
    pub timestamp: SystemTime,
}

/// Settlement terms agreed upon
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SettlementTerms {
    pub order_id: OrderID,
    pub zec_amount: u64,
    pub stablecoin_amount: u64,
    pub stablecoin_type: StablecoinType,
    pub maker_address: String,
    pub taker_address: String,
    pub secret_hash: Hash,
    pub timelock_blocks: u32,
}

/// Signed settlement ready for execution
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SignedSettlement {
    pub terms: SettlementTerms,
    pub maker_signature: Vec<u8>,
    pub taker_signature: Vec<u8>,
    pub finalized_at: SystemTime,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_terminal() {
        let cancelled = NegotiationState::Cancelled {
            reason: "timeout".to_string(),
        };
        assert!(cancelled.is_terminal());
        assert!(!cancelled.is_active());

        let requested = NegotiationState::DetailsRequested {
            timestamp: SystemTime::now(),
        };
        assert!(!requested.is_terminal());
        assert!(requested.is_active());
    }

    #[test]
    fn test_proposal_serialization() {
        let proposal = Proposal {
            price: 450,
            amount: 10000,
            proposer: Role::Taker,
            timestamp: SystemTime::now(),
        };

        let serialized = serde_json::to_string(&proposal).unwrap();
        let deserialized: Proposal = serde_json::from_str(&serialized).unwrap();

        assert_eq!(proposal.price, deserialized.price);
        assert_eq!(proposal.amount, deserialized.amount);
    }

    #[test]
    fn test_settlement_terms_serialization() {
        let terms = SettlementTerms {
            order_id: OrderID::generate(),
            zec_amount: 10000,
            stablecoin_amount: 4500000,
            stablecoin_type: StablecoinType::USDC,
            maker_address: "zs1test...".to_string(),
            taker_address: "zs1test2...".to_string(),
            secret_hash: Hash::from_bytes(b"test"),
            timelock_blocks: 144,
        };

        let serialized = serde_json::to_string(&terms).unwrap();
        let deserialized: SettlementTerms = serde_json::from_str(&serialized).unwrap();

        assert_eq!(terms.zec_amount, deserialized.zec_amount);
        assert_eq!(terms.timelock_blocks, deserialized.timelock_blocks);
    }
}
