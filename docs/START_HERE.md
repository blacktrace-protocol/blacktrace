# BlackTrace - Start Here

**Quick Start Guide for Development Sessions**

This document serves as the entry point for understanding the BlackTrace project. Read this first when starting any development session.

---

## What is BlackTrace?

BlackTrace is a **zero-knowledge OTC coordination protocol** for institutional Zcash trading. It enables institutions to execute large-volume ZEC ↔ Stablecoin trades without:
- Market impact
- Information leakage
- Counterparty risk

---

## 📚 Documentation Roadmap

Read these documents in order to understand the project:

### 1. Project Understanding (Read First)
Located in `docs/` directory:

1. **`1-elevator_pitch.txt`** - High-level overview, problem statement, solution
2. **`2-project_structure.txt`** - Directory structure, module organization
3. **`3-blacktrace_architecture.txt`** - Four-layer architecture, component details
4. **`4-impl_instructions.txt`** - Implementation methodology, testing strategy
5. **`5-two-layer-htlc-design.txt`** - Atomic swap mechanism (L1 + L2 HTLCs)

### 2. Technical Documentation (Deep Dive)

6. **`ARCHITECTURE.md`** ⭐ - Comprehensive system design document
   - Four-layer architecture diagrams
   - All implemented components
   - Two-layer HTLC mechanism
   - Complete trade lifecycle
   - Security considerations
   - Design decisions and rationale

7. **`IMPLEMENTATION_STATUS.md`** ⭐ - Current implementation state
   - Component-by-component status (7/13 complete)
   - Detailed task tracking
   - Known issues and technical debt
   - Next steps and priorities
   - Questions for clarification

8. **`gitflow.txt`** - Git workflow conventions
   - Feature branch strategy
   - Commit message format (Conventional Commits)
   - Merge and cleanup process

---

## 🎯 Current State Summary

**Phase**: Off-chain workflow COMPLETE ✅
**Next**: On-chain integration (Two-Layer HTLC)

### Completed (7/13 components, 54%)
✅ Core types and error handling
✅ P2P network manager (custom TCP)
✅ Zero-knowledge commitment scheme
✅ Negotiation engine with state machine
✅ CLI and application layer
✅ 42 tests passing

### Pending (6/13 components, 46%)
⏳ E2E off-chain testing (NEXT TASK)
⏳ Zcash L1 RPC client + Orchard HTLC
⏳ Ztarknet L2 client + Cairo HTLC
⏳ Two-layer settlement coordinator
⏳ Dual-layer blockchain monitor
⏳ E2E atomic swap testing

---

## 🚀 Quick Start for New Session

### Step 1: Environment Check
```bash
# Verify Rust version
rustc --version  # Should be 1.91.1 or later

# Verify project builds
cargo build

# Run tests
cargo test  # Should see: 42 passed
```

### Step 2: Read Current Status
1. Open `docs/IMPLEMENTATION_STATUS.md`
2. Check "Quick Status Summary" section
3. Review "Next Session Checklist"
4. Identify current task

### Step 3: Review Architecture (if needed)
1. Open `docs/ARCHITECTURE.md`
2. Review relevant component sections
3. Understand data flows

### Step 4: Check Git State
```bash
git status
git log --oneline -5  # Recent commits
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: CLI & User Interface                          │
│ Commands: node, order, negotiate, query                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Application Logic (Off-Chain) ✅ COMPLETE     │
│ ┌─────────────┐ ┌──────────────┐ ┌─────────────────┐  │
│ │ P2P Network │ │ ZK Commitments│ │ Negotiation     │  │
│ │ (Custom TCP)│ │ (Hash-based) │ │ (State Machine) │  │
│ └─────────────┘ └──────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: L2 Contracts (Ztarknet) ⏳ PENDING            │
│ - Cairo HTLC contracts for USDC                         │
│ - Privacy-preserving settlement                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: L1 Blockchain (Zcash) ⏳ PENDING              │
│ - Shielded Orchard HTLC for ZEC                        │
│ - Final settlement layer                                │
└─────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Design Decisions

### 1. Two-Layer HTLC Atomic Swap
- **L1 (Zcash)**: ZEC locked in shielded Orchard HTLC
- **L2 (Ztarknet)**: USDC locked in Cairo smart contract HTLC
- **Same secret (S)** ensures atomicity across layers

**Flow**:
1. Both parties lock assets with Hash(S)
2. Maker reveals S on L2 to claim USDC (public reveal)
3. Taker sees S on L2, uses it to claim ZEC on L1
4. Timeout fallback: refunds if secret not revealed

### 2. Minimal TCP vs libp2p
- **Decision**: Custom TCP implementation (~350 lines)
- **Rationale**: Avoided libp2p dependency hell (base64ct edition2024 issues)
- **Trade-off**: Manual peer discovery but reliable and simple

### 3. Off-Chain First, Then On-Chain
- **Decision**: Build complete CLI workflow before blockchain integration
- **Rationale**: Test P2P and negotiation independently, faster iteration
- **Status**: Off-chain complete ✅, on-chain pending ⏳

---

## 📋 Common Tasks

### Run the Node
```bash
cargo run -- node --port 9000
cargo run -- node --port 9001 --connect 127.0.0.1:9000  # Second node
```

### Run Tests
```bash
cargo test                    # All tests
cargo test --lib             # Library tests only
cargo test integration_      # Integration tests only
```

### Check Code Quality
```bash
cargo clippy                 # Linting
cargo fmt                    # Format code
cargo build --release        # Release build
```

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes, commit
git add .
git commit -m "feat: implement my feature"

# Merge to main (if tests pass)
git checkout main
git merge feature/my-feature
git branch -d feature/my-feature
```

---

## 🗂️ Project Structure

```
blacktrace/
├── docs/                    # All documentation
│   ├── START_HERE.md       # ⭐ This file (read first)
│   ├── ARCHITECTURE.md     # ⭐ System design
│   ├── IMPLEMENTATION_STATUS.md  # ⭐ Current state
│   ├── 1-elevator_pitch.txt
│   ├── 2-project_structure.txt
│   ├── 3-blacktrace_architecture.txt
│   ├── 4-impl_instructions.txt
│   ├── 5-two-layer-htlc-design.txt
│   └── gitflow.txt
│
├── src/
│   ├── types.rs            # Core types (OrderID, PeerID, etc.)
│   ├── error.rs            # Error handling (30+ variants)
│   ├── lib.rs              # Library root
│   ├── main.rs             # CLI binary
│   │
│   ├── p2p/                # ✅ P2P networking (custom TCP)
│   │   ├── network_manager.rs
│   │   ├── message.rs
│   │   └── mod.rs
│   │
│   ├── crypto/             # ✅ ZK commitments
│   │   ├── commitment.rs
│   │   ├── types.rs
│   │   └── mod.rs
│   │
│   ├── negotiation/        # ✅ Price discovery
│   │   ├── engine.rs
│   │   ├── session.rs
│   │   ├── types.rs
│   │   └── mod.rs
│   │
│   ├── cli/                # ✅ CLI interface
│   │   ├── app.rs
│   │   ├── commands.rs
│   │   └── mod.rs
│   │
│   ├── zcash/              # ⏳ TODO: L1 integration
│   ├── ztarknet/           # ⏳ TODO: L2 integration
│   ├── settlement/         # ⏳ TODO: Coordinator
│   └── monitor/            # ⏳ TODO: Blockchain monitor
│
├── tests/                  # Integration tests
├── examples/               # Example usage
├── Cargo.toml              # Dependencies
└── README.md               # Project README
```

---

## 🎓 Key Concepts

### Zero-Knowledge Commitments
```rust
commitment_hash = Hash(amount || salt)
nullifier = Hash(viewing_key || order_id)
```
- Prove liquidity without revealing amounts
- Prevent double-spending via nullifiers

### Negotiation State Machine
```
DetailsRequested → DetailsRevealed → PriceDiscovery → TermsAgreed
                                                    ↘ Cancelled
```
- Maker: Creates orders
- Taker: Discovers and negotiates
- Multi-round price proposals

### Two-Layer HTLC
```
Phase 1: Commitment
  Maker locks ZEC on L1 with Hash(S)
  Taker locks USDC on L2 with Hash(S)

Phase 2: Execution
  Maker reveals S on L2 → claims USDC
  Taker sees S → claims ZEC on L1
```

---

## 🛠️ Development Environment

### Required
- Rust 1.91.1+ (use `rustup`)
- Cargo (comes with Rust)
- Git

### Optional (for on-chain)
- zcashd node (regtest/testnet)
- Ztarknet access (or mocks)

### Dependencies
- `tokio` - Async runtime
- `serde` - Serialization
- `blake2` - Hashing
- `clap` - CLI parsing
- `tracing` - Logging

---

## 📞 Getting Help

### Debugging Common Issues

**Build fails:**
```bash
cargo clean
cargo update
cargo build
```

**Tests fail:**
```bash
cargo test -- --nocapture  # See output
cargo test <test_name>     # Run specific test
```

**Git conflicts:**
```bash
git status
git diff
# Resolve conflicts manually
git add .
git commit
```

---

## 🎯 Next Steps (For Current Session)

**Priority 1: E2E Off-Chain Testing**
- Create `tests/e2e_offchain.rs`
- Test two-node workflow manually
- Verify order creation → negotiation → settlement

**Priority 2: Zcash L1 Integration**
- Research `zcash_primitives` crate
- Design RPC client interface
- Implement Orchard HTLC builder

**Priority 3: Ztarknet L2 Integration**
- Investigate Ztarknet availability
- Design Cairo HTLC interface
- Plan secret reveal monitoring

See `docs/IMPLEMENTATION_STATUS.md` for detailed task breakdown.

---

## 📊 Success Metrics

**Current**:
- ✅ 42 tests passing
- ✅ Clean build (no warnings)
- ✅ Off-chain workflow complete

**Target**:
- 🎯 100+ tests (add E2E tests)
- 🎯 Full atomic swap demonstration
- 🎯 Production-ready error handling
- 🎯 Comprehensive documentation

---

## 🔗 External Resources

- **Zcash Protocol**: https://zips.z.cash/protocol/protocol.pdf
- **HTLC Explanation**: https://en.bitcoin.it/wiki/Hash_Time_Locked_Contracts
- **Conventional Commits**: https://www.conventionalcommits.org/
- **Rust Book**: https://doc.rust-lang.org/book/

---

**Remember**: Always read `docs/IMPLEMENTATION_STATUS.md` for the most current state before making changes!
