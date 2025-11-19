# BlackTrace Architecture

Zero-knowledge OTC protocol for institutional Zcash trading with dual-layer settlement.

---

## System Overview

BlackTrace is a decentralized peer-to-peer protocol for secure, private OTC (over-the-counter) trading of Zcash with stablecoin settlement. The system combines off-chain negotiation with on-chain atomic settlement across two layers:

- **Layer 1 (Zcash)**: Shielded ZEC transfers using Orchard HTLCs
- **Layer 2 (Ztarknet)**: Stablecoin transfers using Cairo HTLCs

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Commands                             │
│  (auth, order, negotiate, query, node)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP + Session Token
                      ↓
┌─────────────────────────────────────────────────────────────┐
│              Authentication Layer (NEW)                      │
│  - Session management (24-hour expiration)                  │
│  - Identity storage (encrypted ECDSA keypairs)              │
│  - Password-based key derivation (PBKDF2)                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ Check auth, load user keys
                      ↓
┌─────────────────────────────────────────────────────────────┐
│              Application Layer                               │
│  - Order management                                          │
│  - Proposal tracking                                         │
│  - Negotiation state machine                                 │
│  - Business logic                                            │
└─────────────────────┬───────────────────────────────────────┘
                      │ Broadcast/send messages
                      ↓
┌─────────────────────────────────────────────────────────────┐
│              P2P Network Layer                               │
│  - libp2p with Noise encryption                             │
│  - Gossipsub for broadcasts                                  │
│  - Direct streams for sensitive data                         │
│  - mDNS peer discovery                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│          Blockchain Settlement Layer (Future)                │
│  - Zcash L1: Orchard shielded HTLC                          │
│  - Ztarknet L2: Cairo HTLC with same secret                 │
│  - Dual-layer atomic swap coordinator                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer Details

### 1. CLI Commands Layer

**Purpose**: User interface for interacting with BlackTrace nodes

**Components**:
- `cmd/root.go` - CLI application entry point
- `cmd/auth.go` - Authentication commands (register, login, logout, whoami)
- `cmd/order.go` - Order management (create, list)
- `cmd/negotiate.go` - Negotiation (request, propose, list-proposals, accept)
- `cmd/query.go` - Network queries (status, peers)
- `cmd/node.go` - Node management (start, list, kill-all)

**Communication**:
- HTTP REST API to local or remote nodes
- Session tokens stored in `~/.blacktrace/session.json`
- API URL configurable via `--api-url` flag

---

### 2. Authentication Layer

**Purpose**: User identity management and session authentication

**Files**:
- `node/identity.go` - ECDSA keypair generation and encrypted storage
- `node/auth.go` - Session management and authentication
- `node/api.go` - Auth endpoints (register, login, logout, whoami)

**Security Design**:

#### Identity Storage
- **Keypair**: ECDSA P-256 (secp256r1)
- **Encryption**: AES-256-GCM with random nonce
- **Key Derivation**: PBKDF2-HMAC-SHA256 (100,000 iterations)
- **Salt**: Random 32-byte salt per identity
- **Location**: `~/.blacktrace/identities/{username}.json`

#### Session Management
- **Session ID**: 64 hex characters (32 random bytes)
- **Expiration**: 24 hours from login
- **Storage**: In-memory map (thread-safe with RWMutex)
- **Cleanup**: Automatic hourly cleanup of expired sessions
- **Persistence**: Session ID saved to `~/.blacktrace/session.json` for CLI

#### Workflow
1. **Registration**: User provides username/password → Generate ECDSA keypair → Encrypt private key → Save to disk
2. **Login**: User provides credentials → Decrypt private key → Create session → Return session ID
3. **Authentication**: CLI includes session ID in requests → Server validates session → Loads user keys → Executes operation

**Design Decision**: One node = One user identity
- Simplifies key management
- Clear ownership of orders and proposals
- Future: Can support multi-user via shared infrastructure nodes

---

### 2.5. Cryptography Layer (NEW - Phase 2B)

**Purpose**: Message-level encryption and authentication for dark OTC coordination

**Files**:
- `node/crypto.go` - ECIES encryption and ECDSA signing
- `node/crypto_test.go` - Comprehensive cryptographic test suite

**Cryptographic Primitives**:

#### ECDSA Message Signatures
- **Curve**: P-256 (secp256r1) - same as identity keys
- **Hash**: SHA-256
- **Encoding**: ASN.1 DER format
- **Purpose**: Authenticate all P2P messages, prevent tampering and impersonation

**Implementation**:
```go
type SignedMessage struct {
    Type            string          // Message type (e.g., "order_announcement")
    Payload         json.RawMessage // Original message payload
    Signature       []byte          // ECDSA signature over (type + payload)
    SignerPublicKey []byte          // 65-byte uncompressed public key
    Timestamp       int64           // Unix timestamp (replay protection)
}
```

**All messages are signed**: Order announcements, proposals, order requests, encrypted order details

#### ECIES Encryption (Elliptic Curve Integrated Encryption Scheme)
- **Purpose**: End-to-end encryption for sensitive order details (amounts, price ranges)
- **Components**:
  1. **ECDH Key Agreement**: Ephemeral keypair + recipient's public key → shared secret
  2. **Key Derivation**: HKDF-SHA256 with "blacktrace-ecies" context
  3. **Encryption**: AES-256-GCM (authenticated encryption)
  4. **Forward Secrecy**: New ephemeral key per message

**Message Structure**:
```go
type ECIESEncryptedMessage struct {
    EphemeralPublicKey []byte // 65 bytes - unique per message (forward secrecy)
    Nonce              []byte // 12 bytes - GCM nonce
    Ciphertext         []byte // Variable length
    AuthTag            []byte // 16 bytes - GCM authentication tag
}
```

**Wire Format**: Compact serialization for network transmission (~100 bytes overhead)

#### Security Properties
- **Confidentiality**: Only intended recipient can decrypt order details
- **Authenticity**: All messages cryptographically signed by sender
- **Integrity**: Tampered messages detected and rejected
- **Forward Secrecy**: Past messages safe even if keys compromised
- **Non-Repudiation**: Signed messages prove sender identity
- **MitM Detection**: Public key caching detects key changes

#### Peer Public Key Management
- **Caching**: First signed message from peer → cache public key
- **Verification**: Subsequent messages verified against cached key
- **MitM Detection**: Key change triggers warning (possible attack)
- **Usage**: Cached keys used for ECIES encryption to that peer

**Workflow**:
1. **Login** → Initialize CryptoManager with user's private key
2. **Outbound**: Sign message with ECDSA → Broadcast/Send
3. **Inbound**: Verify signature → Cache peer public key → Process message
4. **Encrypted Details**: Look up peer's cached public key → ECIES encrypt → Sign → Send

**Backward Compatibility**: Graceful degradation to unsigned messages if CryptoManager not initialized

**Real-World Usage**: Same cryptography as Ethereum (Whisper), Bitcoin (Lightning), Signal Protocol

---

### 3. Application Layer

**Purpose**: Core business logic for OTC trading workflow

**Files**:
- `node/app.go` - Main application orchestration
- `node/types.go` - Data structures (Order, Proposal, etc.)

**Components**:

#### Order Management
- **OrderID**: Timestamp-based unique identifiers (`order_{unix_timestamp}`)
- **Storage**: In-memory map with RWMutex
- **Types**: Sell orders (makers post, takers respond)
- **Broadcast**: Orders announced via gossipsub to all peers

#### Proposal Tracking
- **ProposalID**: `{orderID}_proposal_{timestamp_nano}`
- **Status**: Pending, Accepted, Rejected
- **Storage**: In-memory map with ProposalID → Proposal
- **Proposer**: Tracked by peer ID

#### Negotiation State Machine
- **Phase 1**: Order announcement (broadcast to network)
- **Phase 2**: Order details request (direct stream, encrypted)
- **Phase 3**: Price proposals (multiple rounds)
- **Phase 4**: Proposal acceptance
- **Phase 5**: Settlement preparation (HTLC setup) - *Future*

**Concurrency Model**:
- Event-driven architecture with Go channels
- Single goroutine processes network events (no mutex needed)
- Single goroutine processes app commands (no mutex needed)
- Read/write locks for order and proposal storage

---

### 4. P2P Network Layer

**Purpose**: Peer-to-peer communication infrastructure

**Files**:
- `node/network.go` - libp2p network manager

**Technology Stack**:
- **libp2p**: P2P networking framework
- **Noise Protocol**: Transport-layer encryption
- **Gossipsub**: Pub/sub for broadcast messages
- **Direct Streams**: Point-to-point for sensitive data
- **mDNS**: Automatic local peer discovery

**Message Types**:

| Message Type | Transport | Signed | Encrypted | Purpose |
|-------------|-----------|--------|-----------|---------|
| `order_announcement` | Gossipsub | ✅ | ❌ | Broadcast order metadata to all peers |
| `order_request` | Gossipsub | ✅ | ❌ | Request full order details |
| `order_details` | Direct Stream | ✅ | ❌ | Send order details (legacy, unencrypted) |
| `encrypted_order_details` | Direct Stream | ✅ | ✅ (ECIES) | Send encrypted order details (Phase 2B) |
| `proposal` | Gossipsub | ✅ | ❌ | Broadcast price proposals |
| `proposal_acceptance` | Direct Stream | ✅ | ❌ | Accept specific proposal (future) |

**Security Layers**:
1. **Transport**: Noise protocol encryption (all P2P communication) ✅
2. **Application**: ECIES encryption for order details (Phase 2B) ✅
3. **Identity**: ECDSA signatures on all messages (Phase 2B) ✅

**Peer Discovery**:
- **mDNS**: Automatic discovery on local networks
- **Manual**: Connect via multiaddr (`--connect` flag)
- **Bootstrap**: DHT bootstrap nodes (future)

---

### 5. Blockchain Settlement Layer (Future)

**Purpose**: Atomic cross-chain settlement of negotiated trades

#### Zcash Layer 1 (Shielded HTLC)
- **Protocol**: Orchard shielded pool
- **Contract**: HTLC with hash preimage reveal
- **Privacy**: Fully shielded ZEC transfer
- **Expiry**: Time-locked with refund mechanism

#### Ztarknet Layer 2 (Cairo HTLC)
- **Protocol**: Cairo smart contract on Starknet
- **Contract**: HTLC with same hash as L1
- **Asset**: USDC/USDT/DAI stablecoins
- **Expiry**: Coordinated with L1 timelock

#### Atomic Swap Coordinator
- **Secret Generation**: 256-bit random preimage
- **Hash Function**: SHA256
- **L1 Setup**: Maker locks ZEC with hash
- **L2 Setup**: Taker locks stablecoin with same hash
- **Claim**: Taker reveals secret to claim ZEC, Maker uses same secret to claim stablecoin
- **Refund**: Time-locked refunds if swap fails

---

## Data Flow

### Off-Chain Negotiation Flow

```
Maker (Node A)                           Taker (Node B)
     │                                        │
     │  1. Register/Login                     │  1. Register/Login
     │     auth register                      │     auth register
     │     auth login                         │     auth login
     │                                        │
     │  2. Create Order                       │
     │     POST /orders/create                │
     │     ↓                                  │
     │  [Gossipsub Broadcast]─────────────────→  3. See Order
     │     "order_announcement"               │     GET /orders
     │                                        │
     │                                        │  4. Request Details
     │  ←─────────────────────────────────────     POST /negotiate/request
     │     "order_request"                    │
     │     ↓                                  │
     │  5. Send Details                       │
     │     "order_details" (direct stream)────→
     │                                        │
     │                                        │  6. Propose Price
     │  ←─────────────────────────────────────     POST /negotiate/propose
     │     "proposal" (gossipsub)             │
     │     ↓                                  │
     │  7. List Proposals                     │
     │     GET /negotiate/proposals           │
     │     ↓                                  │
     │  8. Accept Proposal                    │
     │     POST /negotiate/accept             │
     │                                        │
     │  [Ready for Settlement]                │  [Ready for Settlement]
     │                                        │
```

### On-Chain Settlement Flow (Future)

```
Maker (Node A)                           Taker (Node B)
     │                                        │
     │  1. Generate HTLC Secret               │
     │     secret = random(256 bits)          │
     │     hash = SHA256(secret)              │
     │                                        │
     │  2. Create L1 HTLC                     │  3. Verify L1 HTLC
     │     Lock 10,000 ZEC                    │     Check hash, amount, expiry
     │     Expiry: 24 hours                   │
     │                                        │
     │                                        │  4. Create L2 HTLC
     │  5. Verify L2 HTLC       ←────────────     Lock $4,600,000 USDC
     │     Check hash matches                 │     Same hash, Expiry: 12 hours
     │                                        │
     │                                        │  6. Claim L1 ZEC
     │  7. Observe Secret ←───────────────────     Reveal secret to claim
     │     Monitor L1 transactions            │     Receive 10,000 ZEC
     │     ↓                                  │
     │  8. Claim L2 USDC                      │
     │     Use revealed secret                │
     │     Receive $4,600,000 USDC            │
     │                                        │
     │  [Swap Complete]                       │  [Swap Complete]
```

---

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user identity
- `POST /auth/login` - Authenticate and create session
- `POST /auth/logout` - Terminate session
- `POST /auth/whoami` - Get current session info

### Orders
- `POST /orders/create` - Create and broadcast order
- `GET /orders` - List all known orders

### Negotiation
- `POST /negotiate/request` - Request order details
- `POST /negotiate/propose` - Propose a price
- `POST /negotiate/proposals` - List proposals for an order
- `POST /negotiate/accept` - Accept a specific proposal

### Network
- `GET /status` - Node status (peer ID, peer count, order count)
- `GET /peers` - List connected peers
- `GET /health` - Health check

---

## File Structure

```
blacktrace-go/
├── cmd/                    # CLI commands
│   ├── root.go            # CLI entry point
│   ├── auth.go            # Auth commands (NEW)
│   ├── order.go           # Order commands
│   ├── negotiate.go       # Negotiation commands
│   ├── query.go           # Query commands
│   └── node.go            # Node management
│
├── node/                   # Core application
│   ├── app.go             # Main application logic
│   ├── identity.go        # Identity management (NEW)
│   ├── auth.go            # Authentication & sessions (NEW)
│   ├── api.go             # HTTP API server
│   ├── network.go         # P2P networking
│   └── types.go           # Data structures
│
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md    # This file
│   ├── CLI_TESTING.md     # CLI testing guide
│   └── TWO_NODE_DEMO.md   # Two-node demo guide
│
├── two_node_demo.sh       # Automated two-node demo
├── TWO_NODE_DEMO_README.md
├── go.mod
├── go.sum
└── main.go
```

---

## Key Design Decisions

### 1. One User = One Node Identity
**Rationale**: Simplifies key management and ownership tracking
- Each node represents one trading entity
- Clear attribution of orders and proposals
- No shared key storage between multiple users
- Future: Can support multi-user via authentication middleware on shared infrastructure

### 2. P2P Layer Unchanged by Auth
**Rationale**: Separation of concerns
- P2P networking is infrastructure (connection, routing, discovery)
- Authentication is application-layer concern (user identity, permissions)
- Auth layer sits on top of P2P without modifying network protocols
- Maintains backward compatibility with network layer

### 3. In-Memory Session Storage
**Rationale**: Simplicity and performance
- Fast session validation (no disk I/O)
- Automatic cleanup on node restart
- Suitable for single-node deployments
- Future: Redis/memcached for distributed session management

### 4. Gossipsub for Order Broadcasts
**Rationale**: Efficient message propagation
- Orders need to reach all potential takers
- No need for direct connections to all peers
- Pub/sub scales better than point-to-point broadcasts
- mDNS handles local discovery automatically

### 5. Direct Streams for Sensitive Data
**Rationale**: Privacy and security
- Order details (exact amounts, price ranges) sent only to interested parties
- Reduces information leakage
- Enables future ECIES encryption of order details
- Complements gossipsub for announcements

---

## Security Considerations

### Current Implementation

1. **Transport Encryption**: Noise protocol encrypts all P2P traffic
2. **Identity Encryption**: Private keys encrypted at rest with AES-256-GCM
3. **Session Security**: Random session tokens, 24-hour expiration
4. **Key Derivation**: PBKDF2 with 100,000 iterations protects against brute force

### Future Enhancements

1. **Application-Level Encryption**:
   - ECIES for order details
   - Ephemeral ECDH for shared secrets
   - HKDF-SHA256 for key derivation

2. **Message Signatures**:
   - ECDSA signatures on all messages
   - Verify sender identity
   - Prevent message tampering

3. **Zero-Knowledge Proofs**:
   - Proof of funds without revealing amounts
   - Proof of authorization without revealing identity
   - Range proofs for valid price ranges

4. **Commitment Schemes**:
   - Commit to order details before revealing
   - Prevent front-running
   - Enable atomic revelations

---

## Performance Characteristics

### Off-Chain (Current)

- **Order Creation**: ~1ms (in-memory + gossipsub broadcast)
- **Proposal Submission**: ~1ms (in-memory storage + broadcast)
- **Negotiation Rounds**: Unlimited (no blockchain constraints)
- **Message Latency**: ~100ms (local network via mDNS)

### On-Chain (Future)

- **L1 HTLC Setup**: ~75 seconds (Zcash 75-second block time)
- **L2 HTLC Setup**: ~1-5 seconds (Starknet fast finality)
- **Secret Reveal**: ~75 seconds (Zcash confirmation)
- **Settlement Finalization**: ~150 seconds (2 Zcash blocks)
- **Total Swap Time**: ~5 minutes (worst case with confirmations)

---

## Scalability

### Current (Off-Chain)

- **Nodes**: Tested with 2 nodes, designed for 100s
- **Orders**: Limited by memory (~1MB per 10,000 orders)
- **Proposals**: Limited by memory (~1MB per 10,000 proposals)
- **Network**: Gossipsub scales to 1000s of peers

### Future (Hybrid)

- **Off-Chain**: Millions of proposals, real-time negotiation
- **On-Chain**: Thousands of settlements per day
- **Optimization**: Batch settlements, Layer 2 aggregation

---

## Roadmap

### Phase 1: Off-Chain Workflow ✅
- [x] P2P networking with libp2p
- [x] Order creation and broadcasting
- [x] Negotiation and proposals
- [x] Proposal tracking and acceptance
- [x] User authentication layer
- [x] CLI-node integration

### Phase 2: Application-Level Encryption (Complete)
- [x] Integrate auth into order/propose flows (Phase 2A - Complete)
- [x] ECIES encryption for order details (Phase 2B - Complete)
- [x] Message signatures with ECDSA (Phase 2B - Complete)
- [x] Peer public key caching with MitM detection (Phase 2B)
- [x] Backward compatibility with unsigned messages (Phase 2B)

### Phase 3: On-Chain Settlement
- [ ] HTLC secret generation
- [ ] Zcash Orchard HTLC builder
- [ ] Ztarknet Cairo HTLC contract
- [ ] Dual-layer atomic swap coordinator
- [ ] Blockchain monitors for secret reveals

### Phase 4: Production Hardening
- [ ] Persistent storage (SQLite/PostgreSQL)
- [ ] Distributed session management
- [ ] Rate limiting and abuse prevention
- [ ] Comprehensive integration tests
- [ ] Monitoring and observability

---

## Testing

### Unit Tests
- Identity encryption/decryption
- Session management
- HTLC secret generation

### Integration Tests
- Two-node P2P workflow
- Order propagation
- Proposal negotiation
- Auth flow end-to-end

### Demo Scripts
- `two_node_demo.sh` - Automated two-node demo
- See `TWO_NODE_DEMO_README.md` for details

---

**Last Updated**: 2025-11-19
**Version**: 0.3.0 (Message Encryption & Signatures - Phase 2B)
**Status**: Phase 1 Complete, Phase 2 Complete (2A + 2B), Phase 3 Next
