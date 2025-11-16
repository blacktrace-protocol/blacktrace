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

### Hybrid Rust-Go Stack

BlackTrace uses a multi-language architecture, with each language optimized for its strengths:

- **Go (`blacktrace-go/`)**: P2P networking with libp2p (encrypted connections, automatic peer discovery)
- **Rust (`src/`)**: Cryptography (Blake2b, ZK proofs) and Zcash L1 integration
- **Integration**: FFI/cgo for calling Rust crypto functions from Go application

### 4-Layer System

1. **Layer 1**: CLI (User Interface)
2. **Layer 2**: Application Logic (P2P, ZK Proofs, Negotiation, Settlement)
3. **Layer 3**: Ztarknet L2 Contracts (ZK-Attester, Order Registry)
4. **Layer 4**: Zcash L1 (Orchard shielded pool + HTLCs)

See `docs/ARCHITECTURE.md` for detailed design rationale.

## Status

> 🚧 **Off-Chain Workflow Complete** - On-chain integration in progress

### Phase 1: Off-Chain Infrastructure (COMPLETE ✅)
- ✅ Project structure and build system
- ✅ Shared types and error handling (OrderID, PeerID, Hash, etc.)
- ✅ P2P network manager (Go + libp2p with Noise encryption)
- ✅ ZK commitment scheme (Rust - hash-based liquidity proofs)
- ✅ Negotiation engine (Rust - multi-round price discovery)
- ✅ Application layer (Go - channel-based architecture)
- ✅ Demo: 6/6 scenarios passing with no deadlocks

### Phase 2: On-Chain Integration (PENDING ⏳)
- ⏳ Zcash L1 RPC client + Orchard HTLC builder
- ⏳ Ztarknet L2 client + Cairo HTLC interface
- ⏳ Two-layer settlement coordinator
- ⏳ Dual-layer blockchain monitor
- ⏳ End-to-end atomic swap testing

**Current Milestone**: 7/13 components complete (54%)

See `docs/START_HERE.md` and `docs/IMPLEMENTATION_STATUS.md` for detailed status.

## Build Instructions

### Go Application (Networking)

```bash
# Navigate to Go implementation
cd blacktrace-go

# Install dependencies
go mod tidy

# Build
go build -o blacktrace-demo

# Run two-node demo
./blacktrace-demo
```

### Rust Library (Cryptography)

```bash
# Build Rust crypto library
cargo build --release

# Run Rust tests
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

### Go Stack (Networking)
- **Go 1.21+** - Application runtime
- **libp2p** - P2P networking framework (gossipsub + streams)
- **Noise Protocol** - Transport encryption
- **mDNS** - Automatic peer discovery

### Rust Stack (Cryptography & Blockchain)
- **Rust 1.91+** - Crypto implementation
- **Blake2b** - Cryptographic hashing for commitments
- **Tokio** - Async runtime for blockchain monitoring
- **Zcash** - Settlement layer (Orchard shielded pool) - pending integration
- **Ztarknet** - L2 privacy layer (Cairo HTLC contracts) - pending integration

## License

MIT
