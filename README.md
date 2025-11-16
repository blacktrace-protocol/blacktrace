# BlackTrace Protocol

**Zero-Knowledge OTC Settlement for Institutional Zcash Trading**

BlackTrace is the decentralized, zero-knowledge OTC coordination protocol built on Zcash. We enable institutions to execute massive, large-volume ZEC trades-worth millions-without market impact, information leakage, or counterparty risk.

## The Problem

Institutional traders face an impossible trilemma:
- **Privacy** (hiding their position)
- **Guaranteed Settlement** (no counterparty risk)
- **Efficient Price Discovery** (finding the best price quickly)

Today's OTC desks leak order information (leading to front-running) and manual 48-hour settlements expose traders to billions in counterparty default risk.

## The Solution

BlackTrace solves the institutional trilemma by building a trustless coordination layer on top of Zcash's Orchard privacy features:

- **Zero-knowledge liquidity proofs**: Prove you have funds without revealing amounts
- **Encrypted P2P negotiation**: Private multi-round price discovery
- **Atomic settlement**: HTLC-based swaps on Zcash L1 with zero counterparty risk
- **Settlement time**: Reduced from 48 hours to ~30 minutes

## Architecture

BlackTrace uses a 4-layer architecture:

1. **Layer 1**: CLI (User Interface)
2. **Layer 2**: Application Logic (P2P, ZK Proofs, Negotiation, Settlement)
3. **Layer 3**: Ztarknet L2 Contracts (ZK-Attester, Order Registry)
4. **Layer 4**: Zcash L1 (Orchard shielded pool + HTLCs)

## Status

> 🚧 **Off-Chain Workflow Complete** - On-chain integration in progress

### Phase 1: Off-Chain Infrastructure (COMPLETE ✅)
- ✅ Project structure and build system
- ✅ Shared types and error handling (OrderID, PeerID, Hash, etc.)
- ✅ P2P network manager (custom TCP implementation)
- ✅ ZK commitment scheme (hash-based liquidity proofs)
- ✅ Negotiation engine (multi-round price discovery)
- ✅ CLI interface (node, order, negotiate, query commands)
- ✅ 42 tests passing

### Phase 2: On-Chain Integration (PENDING ⏳)
- ⏳ Zcash L1 RPC client + Orchard HTLC builder
- ⏳ Ztarknet L2 client + Cairo HTLC interface
- ⏳ Two-layer settlement coordinator
- ⏳ Dual-layer blockchain monitor
- ⏳ End-to-end atomic swap testing

**Current Milestone**: 7/13 components complete (54%)

See `docs/START_HERE.md` and `docs/IMPLEMENTATION_STATUS.md` for detailed status.

## Build Instructions

```bash
# Clone the repository
git clone https://github.com/yourusername/blacktrace
cd blacktrace

# Build the project
cargo build --release

# Run tests
cargo test
```

## Testing

```bash
# Run all tests
cargo test

# Run specific test suite
cargo test --test unit
cargo test --test integration
```

## Built With

- **Rust** - Core implementation language
- **Tokio** - Async runtime
- **Custom TCP** - P2P networking (length-prefixed framing)
- **Blake2b** - Cryptographic hashing for commitments
- **Clap** - CLI interface
- **Zcash** - Settlement layer (Orchard shielded pool) - pending integration
- **Ztarknet** - L2 privacy layer (Cairo HTLC contracts) - pending integration

## License

MIT
