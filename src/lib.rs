//! BlackTrace Protocol
//!
//! Zero-Knowledge OTC Settlement for Institutional Zcash Trading
//!
//! BlackTrace enables institutions to execute large-volume ZEC trades without
//! market impact, information leakage, or counterparty risk.

// Public modules (will be implemented)
pub mod types;
pub mod error;

// Re-export common types
pub use error::{BlackTraceError, Result};
