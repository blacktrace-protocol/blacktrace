//! BlackTrace Protocol
//!
//! Zero-Knowledge OTC Settlement for Institutional Zcash Trading
//!
//! BlackTrace enables institutions to execute large-volume ZEC trades without
//! market impact, information leakage, or counterparty risk.

// Public modules
pub mod types;
pub mod error;
pub mod p2p;
pub mod crypto;
pub mod negotiation;
pub mod cli;

// Re-export common types
pub use error::{BlackTraceError, Result};
