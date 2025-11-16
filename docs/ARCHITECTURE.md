# BlackTrace Architecture

## Overview

BlackTrace is a zero-knowledge OTC coordination protocol for institutional Zcash trading. It enables institutions to execute large-volume ZEC trades without market impact, information leakage, or counterparty risk.

## Four-Layer System Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: CLI & User Interface                          │
│ - Command-line interface for node operations           │
│ - Order management, negotiation, queries                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Application Logic (Off-Chain)                 │
│ ┌─────────────┐ ┌──────────────┐ ┌─────────────────┐  │
│ │ P2P Network │ │ ZK Commitments│ │ Negotiation     │  │
│ │ Manager     │ │ & Proofs      │ │ Engine          │  │
│ └─────────────┘ └──────────────┘ └─────────────────┘  │
│ ┌─────────────┐ ┌──────────────┐ ┌─────────────────┐  │
│ │ Settlement  │ │ Blockchain   │ │ Transaction     │  │
│ │ Coordinator │ │ Monitor      │ │ Builder         │  │
│ └─────────────┘ └──────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: L2 Smart Contracts (Ztarknet)                 │
│ - Cairo HTLC contracts for USDC                         │
│ - Privacy-preserving settlement logic                   │
│ - Asset tokenization (USDC on Ztarknet)                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: L1 Blockchain (Zcash)                         │
│ - Shielded Orchard HTLC for ZEC                        │
│ - Native ZEC transfers                                  │
│ - Final settlement layer                                │
└─────────────────────────────────────────────────────────┘
```

## Core Components (Implemented)

### 1. Types System (`src/types.rs`)

Foundation types used throughout BlackTrace:

- **OrderID**: Timestamp-based unique identifiers for orders
- **PeerID**: Derived from public key hash for P2P identity
- **Hash**: Blake2b-256 wrapper for commitments
- **SecretPreimage**: HTLC secrets with hashing capability
- **OrderType**: Buy/Sell enumeration
- **StablecoinType**: USDC/USDT/DAI support

### 2. Error Handling (`src/error.rs`)

Comprehensive error system with 30+ variants:
- Network errors (connection, timeouts, protocol)
- Cryptographic errors (proof verification, commitment)
- Business logic errors (insufficient balance, order not found)
- Blockchain errors (transaction, RPC, block parsing)

### 3. P2P Network Manager (`src/p2p/`)

**Design Decision**: Minimal TCP implementation (not libp2p)
- Avoided dependency hell and compatibility issues
- ~350 lines of focused, maintainable code
- Length-prefixed message framing (4-byte BE + payload)

**Features:**
- Manual peer connection management
- Broadcast messaging to all peers
- Direct peer-to-peer messaging
- Event-driven architecture (PeerConnected, PeerDisconnected, MessageReceived)

**Protocol:**
```
┌──────────────┬────────────────────────┐
│ Length (4B)  │ Payload (variable)     │
│ Big Endian   │ Serialized message     │
└──────────────┴────────────────────────┘
```

### 4. Zero-Knowledge Commitments (`src/crypto/`)

**Commitment Scheme:**
```
commitment_hash = Hash(amount || salt)
nullifier = Hash(viewing_key || order_id)
```

**Purpose:**
- Prove liquidity without revealing exact amounts
- Prevent double-spending via nullifiers
- Privacy-preserving order announcements

**Types:**
- `LiquidityCommitment`: Public commitment with nullifier
- `CommitmentOpening`: Private opening (amount + salt)
- `Nullifier`: Prevents order reuse

### 5. Negotiation Engine (`src/negotiation/`)

**State Machine:**
```
DetailsRequested → DetailsRevealed → PriceDiscovery → TermsAgreed
                                                    ↘ Cancelled
```

**Roles:**
- **Maker**: Creates and publishes orders
- **Taker**: Discovers and negotiates on orders

**Session Management:**
- Per-order negotiation tracking
- Multi-round proposal history
- Counterparty identification
- State validation and transitions

**Flow:**
1. Taker requests order details from Maker
2. Maker reveals full order details (amount, price range)
3. Multi-round price discovery (proposals/counter-proposals)
4. Both parties agree on final terms
5. Settlement terms signed by both parties

### 6. CLI & Application (`src/cli/`)

**BlackTraceApp Integration Layer:**
- Combines NetworkManager, NegotiationEngine, OrderStorage
- Event loop for handling network messages
- Order lifecycle management
- Negotiation coordination

**Commands:**
- `node --port <PORT> --connect <PEER>`: Start node and optionally connect
- `order create/list/cancel`: Order management
- `negotiate request/propose/accept/cancel`: Negotiation flow
- `query peers/orders/negotiations`: Information queries

## Two-Layer HTLC Atomic Swap

### Architecture

BlackTrace achieves atomic ZEC ↔ USDC swaps using **two HTLCs on different layers** with the **same secret**:

| Layer | Asset | HTLC Location | Technology |
|-------|-------|---------------|------------|
| Zcash L1 | ZEC (from Maker) | Shielded Orchard Protocol | Native Zcash HTLC |
| Ztarknet L2 | USDC (from Taker) | Cairo Smart Contract | Cairo HTLC Contract |

### Atomic Execution Flow

#### Phase 1: Commitment (Lock Assets)

**Step 1 - Maker Locks ZEC (L1):**
```
Action: Lock ZEC in shielded Orchard address
Condition: Can only be claimed with secret S OR refunded after timeout
Result: ZEC locked privately on L1
```

**Step 2 - Taker Locks USDC (L2):**
```
Action: Lock USDC in Cairo HTLC contract
Condition: Can only be claimed with same secret S OR refunded after timeout
Result: USDC locked trustlessly on L2
```

#### Phase 2: Execution (Reveal & Claim)

**Step 3 - Maker Claims USDC (L2):**
```
Action: Maker sends transaction to L2 revealing secret S
Verification: Cairo contract verifies Hash(S) matches commitment
Result: USDC released to Maker
CRITICAL: Secret S now publicly visible on L2
```

**Step 4 - Taker Claims ZEC (L1):**
```
Action: Taker's monitor detects S on L2, constructs L1 claim transaction
Verification: Zcash protocol verifies S matches HTLC
Result: ZEC released to Taker
```

### Atomicity Guarantee

The hash timelock contract logic ensures:

1. **If Maker reveals S**: Taker is guaranteed to see S and claim ZEC before timeout
2. **If Maker doesn't reveal S**: Both parties can reclaim their original assets after timeout
3. **No counterparty risk**: Neither party can steal the other's assets
4. **Privacy preserved**: ZEC transfers remain shielded on L1

### Timelock Parameters

```rust
pub struct SettlementTerms {
    pub secret_hash: Hash,        // Hash(S)
    pub timelock_blocks: u32,     // e.g., 144 blocks (~24 hours)
    // L2 timeout must be shorter than L1 timeout
    // Ensures Taker has time to claim after seeing S on L2
}
```

## Data Flow: Complete Trade Lifecycle

### 1. Order Creation & Broadcast

```
Maker (Node A)
  ↓
  1. Generate commitment: Hash(amount || salt)
  2. Generate nullifier: Hash(viewing_key || order_id)
  3. Create OrderAnnouncement (public)
     - order_id
     - order_type (Buy/Sell)
     - stablecoin (USDC/USDT/DAI)
     - proof_commitment (hides amount)
     - timestamp, expiry
  4. Broadcast to P2P network
  ↓
All Connected Peers (Node B, C, D...)
  - Receive OrderAnnouncement
  - Store in local order book
  - Verify commitment (future: ZK proof verification)
```

### 2. Order Discovery & Interest

```
Taker (Node B)
  ↓
  1. Query local order book
  2. Filter by: stablecoin, order_type, expiry
  3. Select interesting order
  4. Request full order details from Maker
  ↓
Maker (Node A)
  ← NegotiationMessage::RequestDetails
  → NegotiationMessage::RevealDetails
     - amount (revealed)
     - min_price, max_price (revealed)
```

### 3. Multi-Round Negotiation

```
Taker proposes: price=450, amount=10000 ZEC
  → Maker receives proposal
    Maker counter-proposes: price=460, amount=10000 ZEC
  ← Taker receives counter
    Taker accepts: price=460
  → Maker receives acceptance
    Both parties agree on terms
```

### 4. Settlement Preparation (Off-Chain)

```
Final Terms Agreed:
  - ZEC amount: 10,000
  - USDC amount: 4,600,000 (10,000 * 460)
  - Secret hash: Hash(S)
  - Maker address: zs1maker...
  - Taker address: zs1taker...
  - Timelock: 144 blocks

Both parties sign settlement terms
  → Ready for on-chain execution
```

### 5. On-Chain Settlement (Future Implementation)

```
Phase 1: Commitment
  Maker → Zcash L1: Lock 10,000 ZEC with Hash(S)
  Taker → Ztarknet L2: Lock 4,600,000 USDC with Hash(S)

Phase 2: Execution
  Maker → Ztarknet L2: Reveal S, claim USDC
  Blockchain Monitor → Detects S on L2
  Taker → Zcash L1: Use S, claim ZEC

Result: Atomic swap complete
```

## Message Types & Protocols

### P2P Network Messages

```rust
pub enum NetworkMessage {
    OrderAnnouncement(OrderAnnouncement),
    OrderInterest(OrderInterest),
    NegotiationMessage(Vec<u8>),  // Encrypted negotiation data
    SettlementCommit(Vec<u8>),     // Settlement signatures
}
```

### Negotiation Protocol Messages

```rust
// Request order details (Taker → Maker)
RequestDetails { order_id }

// Reveal order details (Maker → Taker)
RevealDetails {
    order_id,
    amount,
    min_price,
    max_price,
    stablecoin,
}

// Price proposal (Either party)
ProposeTerms {
    order_id,
    price,
    amount,
}

// Accept and finalize (Either party)
AcceptTerms {
    order_id,
    settlement_terms,
    signature,
}

// Cancel negotiation (Either party)
CancelNegotiation {
    order_id,
    reason,
}
```

## Implementation Status

### ✅ Completed Components

1. **Core Types & Error Handling** - 11 tests passing
2. **P2P Network Manager** - 4 integration tests passing
3. **ZK Commitment Scheme** - 11 tests passing
4. **Negotiation Engine** - 16 tests passing
5. **CLI & Application Layer** - Integrated, all 42 tests passing

**Total: 42 tests passing, ~1500 lines of production code**

### 🚧 Pending Components

6. **Zcash L1 RPC Client**
   - Connect to Zcash node
   - Construct shielded Orchard transactions
   - Build L1 HTLC transactions
   - Query blockchain state

7. **Ztarknet L2 Client**
   - Connect to Ztarknet sequencer
   - Interact with Cairo HTLC contracts
   - Query L2 state and events
   - Submit transactions

8. **Two-Layer Settlement Coordinator**
   - Orchestrate dual-layer HTLCs
   - Secret generation and management
   - Coordinate timeouts
   - Handle refund scenarios

9. **Dual-Layer Blockchain Monitor**
   - Watch Zcash L1 for HTLC events
   - Watch Ztarknet L2 for secret reveals
   - Alert on timeout conditions
   - Trigger automated claims

10. **End-to-End Testing**
    - Two-node off-chain workflow
    - Full atomic swap simulation
    - Timeout and refund scenarios
    - Security testing

## Security Considerations

### Privacy Guarantees

1. **Order Commitments**: Amounts hidden until negotiation begins
2. **Shielded Transfers**: ZEC transfers use Orchard shielded addresses
3. **Encrypted Negotiation**: Price discovery happens off-chain, privately
4. **Nullifiers**: Prevent double-spending without revealing order details

### Atomicity Guarantees

1. **HTLC Mechanism**: Both parties either swap or get refunds
2. **Same Secret**: S used on both L1 and L2 ensures atomic execution
3. **Timelock Safety**: Properly ordered timeouts prevent fund loss
4. **No Counterparty Risk**: Smart contracts enforce fair exchange

### Potential Attack Vectors & Mitigations

1. **Front-running**:
   - L2 secret reveal is public
   - Mitigation: Sufficient time gap for Taker to claim on L1

2. **Timeout Griefing**:
   - Maker locks ZEC but never reveals secret
   - Mitigation: Timelock allows refund after expiry

3. **Network Partition**:
   - Taker's monitor offline when secret revealed
   - Mitigation: Redundant monitoring, generous timelock period

4. **ZK Proof Forgery**:
   - False liquidity commitments
   - Mitigation: Proper proof verification (to be implemented)

## Design Decisions & Rationale

### 1. Minimal TCP vs libp2p

**Decision**: Custom TCP implementation

**Rationale**:
- libp2p had severe dependency conflicts (base64ct edition2024, icu_* crates)
- Spent hours debugging without resolution
- Custom TCP: ~350 lines, works reliably, no external dependencies
- Trade-off: Manual peer discovery vs automatic DHT
- For hackathon/MVP: Simplicity and reliability > feature richness

### 2. Off-Chain Negotiation First

**Decision**: Build complete CLI workflow before on-chain integration

**Rationale**:
- Test P2P networking in isolation
- Validate negotiation state machine independently
- Faster iteration without blockchain dependencies
- Easier debugging and testing
- Can demo off-chain coordination immediately

### 3. Two-Layer HTLC vs Single Layer

**Decision**: Dual-layer atomic swap (Zcash L1 + Ztarknet L2)

**Rationale**:
- USDC exists on Ztarknet L2, not Zcash L1
- Native ZEC on L1, tokenized USDC on L2
- Same secret ensures atomic swap across layers
- L2 provides privacy and efficiency for stablecoin operations
- L1 provides security and finality for ZEC

### 4. Hash Commitments vs Full ZK Proofs

**Decision**: Start with hash-based commitments, add ZK later

**Rationale**:
- Hash commitments sufficient for MVP liquidity privacy
- Full ZK proofs (range proofs, etc.) add complexity
- Can upgrade commitment scheme without changing architecture
- Focus on end-to-end workflow first

## Future Enhancements

### Phase 2: Enhanced Privacy
- Range proofs for commitment amounts
- Encrypted P2P channels
- Anonymous credential system
- Decentralized peer discovery

### Phase 3: Advanced Features
- Multi-party trades (>2 participants)
- Partial fill support
- Order book aggregation
- Price oracle integration

### Phase 4: Production Hardening
- Byzantine fault tolerance
- Formal verification of HTLC logic
- Audit of cryptographic implementations
- Stress testing and benchmarking

## References

- Zcash Orchard Protocol: https://zips.z.cash/protocol/protocol.pdf
- HTLC Atomic Swaps: https://en.bitcoin.it/wiki/Hash_Time_Locked_Contracts
- Ztarknet: Privacy-preserving L2 for Zcash (in development)
- Cairo: StarkWare's smart contract language

---

**Document Version**: 1.0
**Last Updated**: 2025-11-16
**Components Complete**: 7/13 (54%)
**Tests Passing**: 42
**Lines of Code**: ~1500
