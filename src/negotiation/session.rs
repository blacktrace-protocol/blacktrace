//! Negotiation session management

use crate::error::{BlackTraceError, Result};
use crate::types::{OrderID, PeerID};
use std::time::SystemTime;

use super::types::{NegotiationState, Proposal, Role, SignedSettlement};

/// A negotiation session between maker and taker
#[derive(Clone, Debug)]
pub struct NegotiationSession {
    order_id: OrderID,
    local_role: Role,
    counterparty_peer_id: PeerID,
    state: NegotiationState,
    proposals: Vec<Proposal>,
    _created_at: SystemTime,
}

impl NegotiationSession {
    /// Create new session as maker
    pub fn new_maker(order_id: OrderID, taker_peer_id: PeerID) -> Self {
        Self {
            order_id,
            local_role: Role::Maker,
            counterparty_peer_id: taker_peer_id,
            state: NegotiationState::DetailsRequested {
                timestamp: SystemTime::now(),
            },
            proposals: Vec::new(),
            _created_at: SystemTime::now(),
        }
    }

    /// Create new session as taker
    pub fn new_taker(order_id: OrderID, maker_peer_id: PeerID) -> Self {
        Self {
            order_id,
            local_role: Role::Taker,
            counterparty_peer_id: maker_peer_id,
            state: NegotiationState::DetailsRequested {
                timestamp: SystemTime::now(),
            },
            proposals: Vec::new(),
            _created_at: SystemTime::now(),
        }
    }

    /// Get order ID
    pub fn order_id(&self) -> &OrderID {
        &self.order_id
    }

    /// Get local role
    pub fn role(&self) -> &Role {
        &self.local_role
    }

    /// Get counterparty peer ID
    pub fn counterparty(&self) -> &PeerID {
        &self.counterparty_peer_id
    }

    /// Get current state
    pub fn state(&self) -> &NegotiationState {
        &self.state
    }

    /// Get all proposals
    pub fn proposals(&self) -> &[Proposal] {
        &self.proposals
    }

    /// Update state
    pub fn set_state(&mut self, state: NegotiationState) -> Result<()> {
        // Check if current state allows transition
        if self.state.is_terminal() {
            return Err(BlackTraceError::InvalidStateTransition(
                "Cannot transition from terminal state".to_string(),
            ));
        }

        self.state = state;
        Ok(())
    }

    /// Add a proposal to the session
    pub fn add_proposal(&mut self, proposal: Proposal) -> Result<()> {
        if self.state.is_terminal() {
            return Err(BlackTraceError::InvalidStateTransition(
                "Cannot add proposal to terminal state".to_string(),
            ));
        }

        self.proposals.push(proposal.clone());

        // Update state to PriceDiscovery if not already
        if !matches!(self.state, NegotiationState::PriceDiscovery { .. }) {
            self.state = NegotiationState::PriceDiscovery {
                proposals: self.proposals.clone(),
            };
        } else {
            // Update proposals in state
            self.state = NegotiationState::PriceDiscovery {
                proposals: self.proposals.clone(),
            };
        }

        Ok(())
    }

    /// Finalize negotiation with signed settlement
    pub fn finalize(&mut self, settlement: SignedSettlement) -> Result<()> {
        if self.state.is_terminal() {
            return Err(BlackTraceError::InvalidStateTransition(
                "Negotiation already finalized".to_string(),
            ));
        }

        // Verify both signatures are present
        if settlement.maker_signature.is_empty() || settlement.taker_signature.is_empty() {
            return Err(BlackTraceError::InvalidProposal(
                "Missing signatures".to_string(),
            ));
        }

        self.state = NegotiationState::TermsAgreed { settlement };
        Ok(())
    }

    /// Cancel negotiation
    pub fn cancel(&mut self, reason: String) {
        self.state = NegotiationState::Cancelled { reason };
    }

    /// Check if negotiation is complete
    pub fn is_complete(&self) -> bool {
        matches!(self.state, NegotiationState::TermsAgreed { .. })
    }

    /// Check if negotiation is cancelled
    pub fn is_cancelled(&self) -> bool {
        matches!(self.state, NegotiationState::Cancelled { .. })
    }

    /// Get the latest proposal price, if any
    pub fn latest_price(&self) -> Option<u64> {
        self.proposals.last().map(|p| p.price)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Hash;

    #[test]
    fn test_session_creation_maker() {
        let order_id = OrderID::generate();
        let taker = PeerID("taker_123".to_string());

        let session = NegotiationSession::new_maker(order_id.clone(), taker);

        assert_eq!(session.role(), &Role::Maker);
        assert_eq!(session.order_id(), &order_id);
        assert!(!session.is_complete());
    }

    #[test]
    fn test_session_creation_taker() {
        let order_id = OrderID::generate();
        let maker = PeerID("maker_456".to_string());

        let session = NegotiationSession::new_taker(order_id.clone(), maker);

        assert_eq!(session.role(), &Role::Taker);
        assert_eq!(session.order_id(), &order_id);
    }

    #[test]
    fn test_add_proposal() {
        let order_id = OrderID::generate();
        let taker = PeerID("taker_123".to_string());
        let mut session = NegotiationSession::new_maker(order_id, taker);

        let proposal = Proposal {
            price: 450,
            amount: 10000,
            proposer: Role::Taker,
            timestamp: SystemTime::now(),
        };

        session.add_proposal(proposal).unwrap();

        assert_eq!(session.proposals().len(), 1);
        assert_eq!(session.latest_price(), Some(450));
    }

    #[test]
    fn test_multiple_proposals() {
        let order_id = OrderID::generate();
        let taker = PeerID("taker_123".to_string());
        let mut session = NegotiationSession::new_maker(order_id, taker);

        // Taker proposes 450
        let proposal1 = Proposal {
            price: 450,
            amount: 10000,
            proposer: Role::Taker,
            timestamp: SystemTime::now(),
        };
        session.add_proposal(proposal1).unwrap();

        // Maker counter-proposes 455
        let proposal2 = Proposal {
            price: 455,
            amount: 10000,
            proposer: Role::Maker,
            timestamp: SystemTime::now(),
        };
        session.add_proposal(proposal2).unwrap();

        assert_eq!(session.proposals().len(), 2);
        assert_eq!(session.latest_price(), Some(455));
    }

    #[test]
    fn test_finalize() {
        let order_id = OrderID::generate();
        let taker = PeerID("taker_123".to_string());
        let mut session = NegotiationSession::new_maker(order_id.clone(), taker);

        let settlement = SignedSettlement {
            terms: super::super::types::SettlementTerms {
                order_id,
                zec_amount: 10000,
                stablecoin_amount: 4500000,
                stablecoin_type: crate::types::StablecoinType::USDC,
                maker_address: "zs1test".to_string(),
                taker_address: "zs1test2".to_string(),
                secret_hash: Hash::from_bytes(b"test"),
                timelock_blocks: 144,
            },
            maker_signature: vec![1, 2, 3],
            taker_signature: vec![4, 5, 6],
            finalized_at: SystemTime::now(),
        };

        session.finalize(settlement).unwrap();

        assert!(session.is_complete());
        assert!(!session.is_cancelled());
    }

    #[test]
    fn test_cancel() {
        let order_id = OrderID::generate();
        let taker = PeerID("taker_123".to_string());
        let mut session = NegotiationSession::new_maker(order_id, taker);

        session.cancel("Taker timeout".to_string());

        assert!(session.is_cancelled());
        assert!(!session.is_complete());
    }

    #[test]
    fn test_cannot_add_proposal_after_finalize() {
        let order_id = OrderID::generate();
        let taker = PeerID("taker_123".to_string());
        let mut session = NegotiationSession::new_maker(order_id.clone(), taker);

        let settlement = SignedSettlement {
            terms: super::super::types::SettlementTerms {
                order_id,
                zec_amount: 10000,
                stablecoin_amount: 4500000,
                stablecoin_type: crate::types::StablecoinType::USDC,
                maker_address: "zs1test".to_string(),
                taker_address: "zs1test2".to_string(),
                secret_hash: Hash::from_bytes(b"test"),
                timelock_blocks: 144,
            },
            maker_signature: vec![1, 2, 3],
            taker_signature: vec![4, 5, 6],
            finalized_at: SystemTime::now(),
        };

        session.finalize(settlement).unwrap();

        // Try to add proposal after finalization
        let proposal = Proposal {
            price: 450,
            amount: 10000,
            proposer: Role::Taker,
            timestamp: SystemTime::now(),
        };

        let result = session.add_proposal(proposal);
        assert!(result.is_err());
    }
}
