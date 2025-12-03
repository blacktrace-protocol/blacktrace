# BlackTrace Architecture

Cross-chain atomic swap protocol for trustless OTC trading with HTLC-based settlement.

---

## System Overview

BlackTrace is a decentralized peer-to-peer protocol for secure, private OTC (over-the-counter) trading with atomic settlement across chains:

- **Zcash**: ZEC transfers using transparent HTLC scripts (P2SH)
- **Solana**: SOL transfers using Anchor HTLC program (native SOL)
- **Starknet**: STRK transfers using Cairo HTLC contracts

---

## Architecture Layers

```
+-------------------------------------------------------------+
|                     CLI Commands                             |
|  (auth, order, negotiate, query, node)                      |
+---------------------+---------------------------------------+
                      | HTTP + Session Token
                      v
+-------------------------------------------------------------+
|              Authentication Layer                            |
|  - Session management (24-hour expiration)                  |
|  - Identity storage (encrypted ECDSA keypairs)              |
|  - Password-based key derivation (PBKDF2)                   |
+---------------------+---------------------------------------+
                      | Check auth, load user keys
                      v
+-------------------------------------------------------------+
|              Application Layer                               |
|  - Order management                                          |
|  - Proposal tracking                                         |
|  - Negotiation state machine                                 |
|  - Business logic                                            |
+---------------------+---------------------------------------+
                      | Broadcast/send messages
                      v
+-------------------------------------------------------------+
|              P2P Network Layer                               |
|  - libp2p with Noise encryption                             |
|  - Gossipsub for broadcasts                                  |
|  - Direct streams for sensitive data                         |
|  - mDNS peer discovery                                       |
+---------------------+---------------------------------------+
                      |
                      v
+-------------------------------------------------------------+
|              Settlement Service                              |
|  - NATS message coordination                                 |
|  - HTLC secret generation                                    |
|  - Settlement state machine                                  |
+---------------------+---------------------------------------+
                      |
          +-----------+-----------+-----------+
          v           v           v
+---------------+ +---------------+ +---------------+
| Zcash         | | Solana        | | Starknet      |
| Connector     | | Connector     | | Connector     |
| - HTLC scripts| | - HTLC program| | - HTLC Cairo  |
| - P2SH address| | - PDA accounts| | - Cairo calls |
| - Claim/Refund| | - Claim/Refund| | - Claim/Refund|
+---------------+ +---------------+ +---------------+
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
- `services/node/identity.go` - ECDSA keypair generation and encrypted storage
- `services/node/auth.go` - Session management and authentication
- `services/node/api.go` - Auth endpoints (register, login, logout, whoami)

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
1. **Registration**: User provides username/password -> Generate ECDSA keypair -> Encrypt private key -> Save to disk
2. **Login**: User provides credentials -> Decrypt private key -> Create session -> Return session ID
3. **Authentication**: CLI includes session ID in requests -> Server validates session -> Loads user keys -> Executes operation

---

### 3. Cryptography Layer

**Purpose**: Message-level encryption and authentication for private OTC coordination

**Files**:
- `services/node/crypto.go` - ECIES encryption and ECDSA signing
- `services/node/crypto_test.go` - Comprehensive cryptographic test suite

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

#### ECIES Encryption (Elliptic Curve Integrated Encryption Scheme)
- **Purpose**: End-to-end encryption for sensitive order details (amounts, price ranges)
- **Components**:
  1. **ECDH Key Agreement**: Ephemeral keypair + recipient's public key -> shared secret
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

#### Security Properties
- **Confidentiality**: Only intended recipient can decrypt order details
- **Authenticity**: All messages cryptographically signed by sender
- **Integrity**: Tampered messages detected and rejected
- **Forward Secrecy**: Past messages safe even if keys compromised
- **Non-Repudiation**: Signed messages prove sender identity

---

### 4. Application Layer

**Purpose**: Core business logic for OTC trading workflow

**Files**:
- `services/node/app.go` - Main application orchestration
- `services/node/types.go` - Data structures (Order, Proposal, etc.)

**Components**:

#### Order Management
- **OrderID**: Timestamp-based unique identifiers (`order_{unix_timestamp}`)
- **Storage**: In-memory map with RWMutex
- **Types**: Sell orders (makers post, takers respond)
- **Broadcast**: Orders announced via gossipsub to all peers

#### Proposal Tracking
- **ProposalID**: `{orderID}_proposal_{timestamp_nano}`
- **Status**: Pending, Accepted, Rejected
- **Storage**: In-memory map with ProposalID -> Proposal
- **Proposer**: Tracked by peer ID

#### Negotiation State Machine
- **Phase 1**: Order announcement (broadcast to network)
- **Phase 2**: Order details request (direct stream, encrypted)
- **Phase 3**: Price proposals (multiple rounds)
- **Phase 4**: Proposal acceptance
- **Phase 5**: Settlement via HTLC

---

### 5. P2P Network Layer

**Purpose**: Peer-to-peer communication infrastructure

**Files**:
- `services/node/network.go` - libp2p network manager

**Technology Stack**:
- **libp2p**: P2P networking framework
- **Noise Protocol**: Transport-layer encryption
- **Gossipsub**: Pub/sub for broadcast messages
- **Direct Streams**: Point-to-point for sensitive data
- **mDNS**: Automatic local peer discovery

**Message Types**:

| Message Type | Transport | Signed | Encrypted | Purpose |
|-------------|-----------|--------|-----------|---------|
| `order_announcement` | Gossipsub | Yes | No | Broadcast order metadata to all peers |
| `order_request` | Gossipsub | Yes | No | Request full order details |
| `order_details` | Direct Stream | Yes | No | Send order details (legacy) |
| `encrypted_order_details` | Direct Stream | Yes | Yes (ECIES) | Send encrypted order details |
| `proposal` | Gossipsub | Yes | No | Broadcast price proposals |
| `proposal_acceptance` | Direct Stream | Yes | No | Accept specific proposal |

---

### 6. Settlement Service

**Purpose**: Coordinate atomic cross-chain settlement via HTLC

**Files**:
- `services/settlement/main.go` - Settlement service entry point
- `services/settlement/handlers.go` - NATS message handlers

**Components**:

#### NATS Integration
- Subscribes to `settlement.request.*` for new settlement requests
- Subscribes to `settlement.status.*` for lock/claim notifications
- Publishes settlement instructions and status updates

#### Secret Management
- **Generation**: Cryptographically secure 32-byte random secret
- **Hash**: RIPEMD160(SHA256(secret)) for hash locks
- **Distribution**: Secret shared with maker after both parties lock

#### Settlement State Machine
```
ready -> alice_locked -> bob_locked -> both_locked -> alice_claimed -> complete
                |            |              |
                v            v              v
             refunded     refunded       refunded
```

---

### 7. Blockchain Connectors

**Purpose**: Chain-specific HTLC implementation

#### Zcash Connector

**Files**:
- `connectors/zcash/htlc.go` - HTLC script construction
- `connectors/zcash/transaction.go` - Transaction building and signing
- `connectors/zcash/rpc.go` - Zcash RPC client

**HTLC Script**:
```
OP_IF
    OP_SHA256 OP_RIPEMD160 <hash_lock> OP_EQUALVERIFY
    OP_DUP OP_HASH160 <recipient_pubkey_hash>
OP_ELSE
    <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP
    OP_DUP OP_HASH160 <refund_pubkey_hash>
OP_ENDIF
OP_EQUALVERIFY OP_CHECKSIG
```

**Features**:
- P2SH address generation from HTLC script
- Lock transaction construction
- Claim transaction with secret reveal
- Refund transaction after timelock

#### Solana Connector

**Files**:
- `connectors/solana/htlc.go` - HTLC program interaction
- `connectors/solana/htlc-contract/` - Anchor HTLC program (Rust)

**HTLC Program**:
- Program ID: `CUxqXa849pvw3TLEWRrA2RyA3vm5SXXwb181BFnRSvej`
- Uses PDA (Program Derived Address) from hash_lock for account storage
- HASH160 (20-byte) hash locks for Zcash compatibility
- Native SOL transfers (lamports)

**Features**:
- Lock native SOL with HASH160 commitment
- Claim with secret reveal (verifies RIPEMD160(SHA256(secret)))
- Refund after Unix timestamp timeout
- PDA-based account management

#### Starknet Connector

**Files**:
- `connectors/starknet/htlc.go` - HTLC contract interaction
- `connectors/starknet/rpc.go` - Starknet RPC client

**Features**:
- Cairo HTLC contract deployment
- Lock STRK with hash commitment
- Claim with secret reveal
- Refund after timelock expiry

---

## Data Flow

### Complete Settlement Flow

```
Maker (Alice)                    Settlement Service                   Taker (Bob)
     |                                  |                                  |
     |  1. Accept proposal              |                                  |
     |  POST /negotiate/accept          |                                  |
     |--------------------------------->|                                  |
     |                                  |                                  |
     |                           2. Generate secret                        |
     |                              hash = RIPEMD160(SHA256(secret))       |
     |                                  |                                  |
     |  3. Lock ZEC                     |                                  |
     |  POST /settlement/lock-zec       |                                  |
     |--------------------------------->|                                  |
     |                                  |                                  |
     |                           4. Create HTLC script                     |
     |                              Build P2SH address                     |
     |                              Send ZEC to HTLC                       |
     |                                  |                                  |
     |                                  |  5. Notify: ZEC locked           |
     |                                  |--------------------------------->|
     |                                  |                                  |
     |                                  |  6. Lock SOL/STRK                |
     |                                  |  POST /settlement/lock-sol       |
     |                                  |<---------------------------------|
     |                                  |                                  |
     |                           7. Create Solana/Starknet HTLC            |
     |                              Lock SOL/STRK with same hash           |
     |                                  |                                  |
     |  8. Both locked notification     |  8. Both locked notification     |
     |<---------------------------------|--------------------------------->|
     |                                  |                                  |
     |  9. Claim SOL/STRK               |                                  |
     |  POST /settlement/claim-sol      |                                  |
     |--------------------------------->|                                  |
     |                                  |                                  |
     |                          10. Reveal secret on Solana/Starknet       |
     |                              Alice receives SOL/STRK                |
     |                                  |                                  |
     |                                  | 11. Secret now visible on-chain  |
     |                                  |--------------------------------->|
     |                                  |                                  |
     |                                  | 12. Claim ZEC                    |
     |                                  |  POST /settlement/claim-zec      |
     |                                  |<---------------------------------|
     |                                  |                                  |
     |                          13. Bob claims ZEC using secret            |
     |                              Bob receives ZEC                       |
     |                                  |                                  |
     v                                  v                                  v
  Complete                          Complete                           Complete
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

### Settlement
- `POST /settlement/lock-zec` - Lock ZEC in HTLC
- `POST /settlement/lock-sol` - Lock SOL in HTLC
- `POST /settlement/lock-strk` - Lock STRK in HTLC
- `POST /settlement/claim-zec` - Claim ZEC with secret
- `POST /settlement/claim-sol` - Claim SOL with secret
- `POST /settlement/claim-strk` - Claim STRK with secret
- `GET /settlement/status` - Get settlement status
- `GET /settlement/queue` - List pending settlements

### Network
- `GET /status` - Node status (peer ID, peer count, order count)
- `GET /peers` - List connected peers
- `GET /health` - Health check

---

## File Structure

```
blacktrace/
+-- cmd/                        # CLI commands (if standalone CLI)
+-- services/
|   +-- node/                   # P2P node service
|   |   +-- app.go             # Main application logic
|   |   +-- identity.go        # Identity management
|   |   +-- auth.go            # Authentication & sessions
|   |   +-- crypto.go          # ECIES & ECDSA
|   |   +-- api.go             # HTTP API server
|   |   +-- network.go         # P2P networking
|   |   +-- types.go           # Data structures
|   |   +-- main.go            # Node entry point
|   |
|   +-- settlement/             # Settlement service
|       +-- main.go            # Settlement entry point
|       +-- handlers.go        # NATS handlers
|
+-- connectors/
|   +-- zcash/                  # Zcash blockchain connector
|   |   +-- htlc.go            # HTLC script construction
|   |   +-- transaction.go     # Transaction building
|   |   +-- rpc.go             # Zcash RPC client
|   |
|   +-- solana/                 # Solana connector
|   |   +-- htlc.go            # HTLC program interaction
|   |   +-- htlc-contract/     # Anchor HTLC program (Rust)
|   |
|   +-- starknet/               # Starknet connector
|       +-- htlc.go            # Cairo HTLC interaction
|       +-- rpc.go             # Starknet RPC client
|
+-- config/
|   +-- docker-compose.yml      # Core services
|   +-- docker-compose.blockchains.yml  # Blockchain nodes
|
+-- scripts/
|   +-- start.sh               # Start services
|   +-- stop.sh                # Stop services
|
+-- frontend/                   # STRK-ZEC demo UI (React + Vite)
|   +-- src/components/        # React components
|   +-- src/lib/chains/        # Chain integration (Starknet)
|
+-- frontend-solana/            # SOL-ZEC demo UI (React + Vite)
|   +-- src/components/        # React components
|   +-- src/lib/chains/        # Chain integration (Solana)
|
+-- docs/                       # Documentation
    +-- ARCHITECTURE.md        # This file
    +-- API.md                 # API reference
    +-- KEY_WORKFLOWS.md       # Workflow documentation
    +-- QUICKSTART.md          # Getting started
```

---

## Key Design Decisions

### 1. HTLC-Based Settlement
**Rationale**: Trustless atomic swaps without custodial risk
- Both parties lock assets with same hash
- Secret reveal enables claim on both chains
- Timelocks ensure automatic refunds if swap fails

### 2. Asymmetric Timelocks
**Rationale**: Prevent race conditions in claiming
- Maker's refund timelock: 24 hours
- Taker's refund timelock: 12 hours
- Taker must claim first, revealing secret for maker

### 3. RIPEMD160(SHA256(secret)) Hash
**Rationale**: Bitcoin/Zcash script compatibility
- Standard hash function for HTLC scripts
- 20-byte output fits in OP_PUSHDATA
- Widely supported across UTXO chains

### 4. Gossipsub for Order Broadcasts
**Rationale**: Efficient message propagation
- Orders need to reach all potential takers
- No need for direct connections to all peers
- Pub/sub scales better than point-to-point broadcasts

### 5. Direct Streams for Sensitive Data
**Rationale**: Privacy and security
- Order details sent only to interested parties
- Reduces information leakage
- Enables ECIES encryption of order details

### 6. NATS for Settlement Coordination
**Rationale**: Reliable message passing between services
- Decouples node logic from settlement logic
- Enables horizontal scaling of settlement service
- Provides message persistence and replay

---

## Security Considerations

### Implemented

1. **Transport Encryption**: Noise protocol encrypts all P2P traffic
2. **Identity Encryption**: Private keys encrypted at rest with AES-256-GCM
3. **Session Security**: Random session tokens, 24-hour expiration
4. **Key Derivation**: PBKDF2 with 100,000 iterations
5. **Message Signatures**: ECDSA signatures on all P2P messages
6. **Order Encryption**: ECIES encryption for sensitive order details
7. **HTLC Atomicity**: Cryptographic guarantee of both-or-neither execution

### Future Enhancements

1. **Zero-Knowledge Proofs**: Proof of funds without revealing amounts
2. **Commitment Schemes**: Commit to order details before revealing
3. **Rate Limiting**: Prevent denial-of-service attacks
4. **Reputation System**: Track counterparty reliability

---

## Performance Characteristics

### Off-Chain

- **Order Creation**: ~1ms (in-memory + gossipsub broadcast)
- **Proposal Submission**: ~1ms (in-memory storage + broadcast)
- **Negotiation Rounds**: Unlimited (no blockchain constraints)
- **Message Latency**: ~100ms (local network via mDNS)

### On-Chain

- **Zcash HTLC Lock**: ~75 seconds (1 block confirmation)
- **Solana HTLC Lock**: ~400ms (slot confirmation)
- **Starknet HTLC Lock**: ~1-5 seconds (fast finality)
- **Secret Reveal**: ~75 seconds (Zcash confirmation)
- **Total Swap Time**: ~3-5 minutes (with confirmations)

---

**Last Updated**: 2025-12-03
**Version**: 2.1
