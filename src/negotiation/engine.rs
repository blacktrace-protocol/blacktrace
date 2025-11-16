//! Negotiation engine manages all active negotiation sessions

use crate::error::{BlackTraceError, Result};
use crate::types::{OrderID, PeerID};
use blake2::Digest;
use std::collections::HashMap;
use std::time::SystemTime;

use super::session::NegotiationSession;
use super::types::{OrderDetails, Proposal, SettlementTerms, SignedSettlement};

/// Negotiation engine manages all active sessions
pub struct NegotiationEngine {
    active_sessions: HashMap<OrderID, NegotiationSession>,
    _local_keypair: (Vec<u8>, Vec<u8>), // (secret_key, public_key) - simplified
}

impl NegotiationEngine {
    /// Create new negotiation engine
    pub fn new() -> Self {
        // Generate a simple keypair (in production, use proper Ed25519)
        let secret_key = vec![42u8; 32];
        let public_key = vec![99u8; 32];

        Self {
            active_sessions: HashMap::new(),
            _local_keypair: (secret_key, public_key),
        }
    }

    /// Request order details as taker
    pub fn request_order_details(
        &mut self,
        order_id: OrderID,
        maker_peer_id: PeerID,
    ) -> Result<Vec<u8>> {
        // Create new taker session
        let session = NegotiationSession::new_taker(order_id.clone(), maker_peer_id);

        // Store session
        self.active_sessions.insert(order_id.clone(), session);

        // Create request message (simplified - just serialize order ID)
        let message = serde_json::to_vec(&order_id)
            .map_err(|e| BlackTraceError::Serialization(e.to_string()))?;

        Ok(message)
    }

    /// Reveal order details as maker
    pub fn reveal_order_details(
        &mut self,
        order_id: &OrderID,
        details: OrderDetails,
        taker_peer_id: PeerID,
    ) -> Result<Vec<u8>> {
        // Get or create maker session
        let session = self
            .active_sessions
            .entry(order_id.clone())
            .or_insert_with(|| NegotiationSession::new_maker(order_id.clone(), taker_peer_id));

        // Update state to DetailsRevealed
        session.set_state(super::types::NegotiationState::DetailsRevealed {
            details: details.clone(),
            timestamp: SystemTime::now(),
        })?;

        // Serialize details (simplified encryption)
        let message = serde_json::to_vec(&details)
            .map_err(|e| BlackTraceError::Serialization(e.to_string()))?;

        Ok(message)
    }

    /// Propose terms (maker or taker)
    pub fn propose_terms(&mut self, order_id: &OrderID, price: u64, amount: u64) -> Result<Vec<u8>> {
        let session = self
            .active_sessions
            .get_mut(order_id)
            .ok_or_else(|| BlackTraceError::SessionNotFound(order_id.0.clone()))?;

        let proposal = Proposal {
            price,
            amount,
            proposer: session.role().clone(),
            timestamp: SystemTime::now(),
        };

        session.add_proposal(proposal.clone())?;

        // Serialize proposal
        let message = serde_json::to_vec(&proposal)
            .map_err(|e| BlackTraceError::Serialization(e.to_string()))?;

        Ok(message)
    }

    /// Accept and finalize settlement terms
    pub fn accept_and_finalize(
        &mut self,
        order_id: &OrderID,
        terms: SettlementTerms,
    ) -> Result<SignedSettlement> {
        // Sign the terms first (before borrowing session)
        let signature = self.sign_terms(&terms)?;

        // Create signed settlement
        let signed = SignedSettlement {
            terms,
            maker_signature: signature.clone(),
            taker_signature: signature, // In reality, counterparty provides this
            finalized_at: SystemTime::now(),
        };

        // Now get mutable session and finalize
        let session = self
            .active_sessions
            .get_mut(order_id)
            .ok_or_else(|| BlackTraceError::SessionNotFound(order_id.0.clone()))?;

        session.finalize(signed.clone())?;

        Ok(signed)
    }

    /// Handle incoming negotiation message
    pub fn handle_message(&mut self, order_id: &OrderID, message: Vec<u8>) -> Result<NegotiationAction> {
        // Try to deserialize as different message types
        // This is simplified - in production, use proper message envelope

        // Try as proposal
        if let Ok(proposal) = serde_json::from_slice::<Proposal>(&message) {
            let session = self
                .active_sessions
                .get_mut(order_id)
                .ok_or_else(|| BlackTraceError::SessionNotFound(order_id.0.clone()))?;

            session.add_proposal(proposal)?;
            return Ok(NegotiationAction::ProposalReceived);
        }

        // Try as order details
        if let Ok(details) = serde_json::from_slice::<OrderDetails>(&message) {
            let session = self
                .active_sessions
                .get_mut(order_id)
                .ok_or_else(|| BlackTraceError::SessionNotFound(order_id.0.clone()))?;

            session.set_state(super::types::NegotiationState::DetailsRevealed {
                details,
                timestamp: SystemTime::now(),
            })?;
            return Ok(NegotiationAction::DetailsReceived);
        }

        Ok(NegotiationAction::Unknown)
    }

    /// Cancel a negotiation session
    pub fn cancel_negotiation(&mut self, order_id: &OrderID, reason: String) -> Result<()> {
        let session = self
            .active_sessions
            .get_mut(order_id)
            .ok_or_else(|| BlackTraceError::SessionNotFound(order_id.0.clone()))?;

        session.cancel(reason);
        Ok(())
    }

    /// Get a session
    pub fn get_session(&self, order_id: &OrderID) -> Option<&NegotiationSession> {
        self.active_sessions.get(order_id)
    }

    /// Get all active sessions
    pub fn active_sessions(&self) -> &HashMap<OrderID, NegotiationSession> {
        &self.active_sessions
    }

    /// Sign settlement terms (simplified)
    fn sign_terms(&self, terms: &SettlementTerms) -> Result<Vec<u8>> {
        // Simplified signing - just serialize and hash
        let serialized = serde_json::to_vec(terms)
            .map_err(|e| BlackTraceError::Serialization(e.to_string()))?;

        // In production, use proper Ed25519 signing
        let signature = blake2::Blake2b512::digest(&serialized);
        Ok(signature[..32].to_vec())
    }
}

impl Default for NegotiationEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Actions resulting from handling messages
#[derive(Debug, PartialEq)]
pub enum NegotiationAction {
    ProposalReceived,
    DetailsReceived,
    Unknown,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Hash, OrderType, StablecoinType};

    #[test]
    fn test_engine_creation() {
        let engine = NegotiationEngine::new();
        assert_eq!(engine.active_sessions().len(), 0);
    }

    #[test]
    fn test_request_order_details() {
        let mut engine = NegotiationEngine::new();
        let order_id = OrderID::generate();
        let maker = PeerID("maker_123".to_string());

        let message = engine.request_order_details(order_id.clone(), maker).unwrap();

        assert!(!message.is_empty());
        assert_eq!(engine.active_sessions().len(), 1);
        assert!(engine.get_session(&order_id).is_some());
    }

    #[test]
    fn test_reveal_order_details() {
        let mut engine = NegotiationEngine::new();
        let order_id = OrderID::generate();
        let taker = PeerID("taker_456".to_string());

        let details = OrderDetails {
            order_id: order_id.clone(),
            order_type: OrderType::Sell,
            amount: 10000,
            min_price: 450,
            max_price: 460,
            stablecoin: StablecoinType::USDC,
        };

        let message = engine
            .reveal_order_details(&order_id, details, taker)
            .unwrap();

        assert!(!message.is_empty());
        assert_eq!(engine.active_sessions().len(), 1);
    }

    #[test]
    fn test_propose_terms() {
        let mut engine = NegotiationEngine::new();
        let order_id = OrderID::generate();
        let maker = PeerID("maker_123".to_string());

        // Create session first
        engine.request_order_details(order_id.clone(), maker).unwrap();

        // Propose terms
        let message = engine.propose_terms(&order_id, 455, 10000).unwrap();

        assert!(!message.is_empty());

        let session = engine.get_session(&order_id).unwrap();
        assert_eq!(session.proposals().len(), 1);
        assert_eq!(session.latest_price(), Some(455));
    }

    #[test]
    fn test_full_negotiation_flow() {
        let mut maker_engine = NegotiationEngine::new();
        let mut taker_engine = NegotiationEngine::new();

        let order_id = OrderID::generate();
        let maker_peer = PeerID("maker".to_string());
        let taker_peer = PeerID("taker".to_string());

        // 1. Taker requests details
        taker_engine
            .request_order_details(order_id.clone(), maker_peer)
            .unwrap();

        // 2. Maker reveals details
        let details = OrderDetails {
            order_id: order_id.clone(),
            order_type: OrderType::Sell,
            amount: 10000,
            min_price: 450,
            max_price: 460,
            stablecoin: StablecoinType::USDC,
        };

        let details_msg = maker_engine
            .reveal_order_details(&order_id, details.clone(), taker_peer)
            .unwrap();

        // Taker receives details
        let action = taker_engine
            .handle_message(&order_id, details_msg)
            .unwrap();
        assert_eq!(action, NegotiationAction::DetailsReceived);

        // 3. Taker proposes price
        let proposal_msg = taker_engine.propose_terms(&order_id, 455, 10000).unwrap();

        // Maker receives proposal
        let action = maker_engine
            .handle_message(&order_id, proposal_msg)
            .unwrap();
        assert_eq!(action, NegotiationAction::ProposalReceived);

        // 4. Both accept terms
        let terms = SettlementTerms {
            order_id: order_id.clone(),
            zec_amount: 10000,
            stablecoin_amount: 4550000,
            stablecoin_type: StablecoinType::USDC,
            maker_address: "zs1maker".to_string(),
            taker_address: "zs1taker".to_string(),
            secret_hash: Hash::from_bytes(b"secret"),
            timelock_blocks: 144,
        };

        let signed = maker_engine.accept_and_finalize(&order_id, terms).unwrap();

        assert!(!signed.maker_signature.is_empty());
        assert!(!signed.taker_signature.is_empty());

        let session = maker_engine.get_session(&order_id).unwrap();
        assert!(session.is_complete());
    }

    #[test]
    fn test_cancel_negotiation() {
        let mut engine = NegotiationEngine::new();
        let order_id = OrderID::generate();
        let maker = PeerID("maker_123".to_string());

        engine.request_order_details(order_id.clone(), maker).unwrap();

        engine
            .cancel_negotiation(&order_id, "Timeout".to_string())
            .unwrap();

        let session = engine.get_session(&order_id).unwrap();
        assert!(session.is_cancelled());
    }
}
