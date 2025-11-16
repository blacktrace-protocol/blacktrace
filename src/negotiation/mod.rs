//! Negotiation module for private price discovery

pub mod engine;
pub mod session;
pub mod types;

pub use engine::{NegotiationAction, NegotiationEngine};
pub use session::NegotiationSession;
pub use types::{
    NegotiationState, OrderDetails, Proposal, Role, SettlementTerms, SignedSettlement,
};
