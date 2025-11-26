# BlackTrace

**Trustless OTC Trading for Crypto-Native Institutions**

BlackTrace enables large, private over-the-counter (OTC) trades between parties who don't trust each other - without counterparty risk, front-running, or intermediaries.

## The Problem

You find a counterparty for a $10M ZEC-USDC trade on Discord. You don't know them. What do you do?

**Today's Options (All Bad):**
- ❌ **Trust them**: Send ZEC first, hope they send USDC (massive counterparty risk)
- ❌ **Use OTC desk**: They see your order and front-run you on exchanges
- ❌ **Escrow service**: Expensive (1-2% fees), slow, still requires trust
- ❌ **Legal agreements**: Weeks of negotiation, only works same-jurisdiction

**The Core Issue**: No way to settle large OTC trades trustlessly with privacy.

## The Solution

BlackTrace provides **trustless settlement with encrypted negotiation**:

1. **Private Order Routing**: Alice sends encrypted order directly to Bob (no broadcast, no leakage)
2. **Encrypted Negotiation**: End-to-end encrypted proposals using ECIES
3. **Atomic Settlement**: HTLC-based swaps guarantee both-or-neither execution
4. **Cross-chain**: Zcash ↔ zTarknet (Starknet), with Solana/NEAR coming

### Key Features

- ✅ **Zero Counterparty Risk**: HTLCs ensure atomic swaps (both or neither)
- ✅ **Front-running Prevention**: Orders encrypted, sent peer-to-peer (not broadcast)
- ✅ **No KYC Required**: Permissionless, privacy-preserving
- ✅ **No Intermediaries**: Direct peer-to-peer settlement
- ✅ **Cross-chain**: Zcash L1 (Orchard) + Starknet stablecoins
- ✅ **Audit Trail**: On-chain settlement verification

## Target Users

**Crypto-Native Institutions:**
- 🏛️ **DAO Treasuries**: Trustless settlement with on-chain transparency
- 🐋 **Privacy Whales**: No KYC, no desk seeing your positions
- 🌍 **Cross-border Traders**: No legal framework needed
- 💬 **Discord/Telegram Deals**: Found counterparty online, need trustless execution

**Not For:**
- Traditional institutions needing fiat settlement
- Users wanting credit lines (we require HTLC collateral)
- High-frequency trading (optimized for large, private trades)

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     BlackTrace Protocol                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. PRIVATE ORDER ROUTING (Encrypted P2P)                   │
│     Alice → [Encrypted Order] → Bob (only)                  │
│                                                              │
│  2. ENCRYPTED NEGOTIATION (ECIES)                           │
│     Bob → [Encrypted Proposal] → Alice                      │
│     Alice → [Encrypted Acceptance] → Bob                    │
│                                                              │
│  3. ATOMIC SETTLEMENT (HTLCs)                               │
│     ┌──────────────────┐    ┌──────────────────┐           │
│     │ Zcash L1 HTLC    │    │ zTarknet HTLC    │           │
│     │ (Alice locks ZEC)│    │ (Bob locks USDC) │           │
│     └────────┬─────────┘    └─────────┬────────┘           │
│              │                         │                     │
│              └─────────┬───────────────┘                     │
│                    Secret Reveal                             │
│              Both claim or both refund                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Trade Flow

1. **Alice**: Creates encrypted order for 10,000 ZEC @ $465
2. **Alice → Bob**: Sends encrypted order directly (peer-to-peer)
3. **Bob**: Decrypts order, sees terms
4. **Bob → Alice**: Sends encrypted counter-proposal
5. **Alice**: Decrypts, reviews, accepts
6. **Settlement Service**: Initiates atomic swap via HTLCs
   - Alice locks 10,000 ZEC on Zcash L1 (Orchard pool)
   - Bob locks $4.65M USDC on zTarknet (Starknet)
   - Both claim with secret reveal, or both refund

**Result**: Trustless, atomic, private OTC trade.

## Technology Stack

- **P2P Network**: libp2p (gossipsub for peer discovery)
- **Encryption**: ECIES (secp256k1) for end-to-end encrypted negotiation
- **Settlement**: HTLC atomic swaps (Zcash + Starknet)
- **Coordination**: Go nodes + NATS message broker
- **HTLC Engine**: Rust service (Zcash + Starknet integration)
- **Frontend**: Next.js institutional dashboard (coming)

## Quick Start

### Option 1: Docker Compose (Full Demo)

```bash
# Start Alice (maker), Bob (taker), NATS, settlement service, and tests
docker-compose up

# View test results
docker logs blacktrace-tests
```

See [README-DOCKER.md](./README-DOCKER.md) for details.

### Option 2: Local Development

```bash
# Terminal 1: Alice (maker node)
go run cmd/blacktrace/main.go node --port 9000 --api-port 8080

# Terminal 2: Bob (taker node)
go run cmd/blacktrace/main.go node --port 9001 --api-port 8081

# Terminal 3: Settlement service
cd settlement-service && cargo run
```

## API Example

```bash
# Alice registers
curl -X POST http://localhost:8080/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret"}'

# Alice logs in
TOKEN=$(curl -X POST http://localhost:8080/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret"}' | jq -r .token)

# Alice creates encrypted order (sent directly to Bob's peer ID)
curl -X POST http://localhost:8080/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "ZEC",
    "amount": 1000000,
    "price": 465,
    "side": "sell",
    "stablecoin": "USDC",
    "recipient_peer_id": "Bob_peer_ID_here"
  }'

# Bob sees encrypted order, decrypts, creates encrypted proposal
curl -X POST http://localhost:8081/proposals \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "order_xxx",
    "amount": 1000000,
    "price": 465
  }'

# Alice decrypts proposal, accepts
curl -X POST http://localhost:8080/proposals/{proposal_id}/accept \
  -H "Authorization: Bearer $TOKEN"

# Settlement request posted to NATS → HTLC creation
```

## Project Status

### ✅ Completed (Phases 1-3)
- [x] P2P networking (libp2p)
- [x] User authentication & key management
- [x] Encrypted order routing (peer-to-peer)
- [x] Encrypted proposals/acceptance (ECIES)
- [x] NATS settlement coordination
- [x] Docker Compose orchestration
- [x] E2E test suite (14/16 passing)

### 🚧 In Progress (Phase 4)
- [ ] Institutional UI dashboard (Next.js)
- [ ] HTLC contracts (Zcash Orchard + Starknet)
- [ ] Atomic swap execution engine

### 🔮 Future (Phase 5+)
- [ ] Solana settlement integration
- [ ] NEAR Intents settlement
- [ ] Multi-party trades (>2 participants)
- [ ] Reputation system

## Why Zcash + Starknet?

**Zcash**: Privacy-preserving Layer 1 for institutional holdings
- Shielded pools (Orchard) for private balances
- Programmable with future ZSAs (Zcash Shielded Assets)
- Trusted by privacy-focused whales

**zTarknet (Starknet)**: Low-cost, fast stablecoin settlement
- USDC/USDT with sub-cent fees
- Cairo smart contracts for HTLCs
- Validity proofs for settlement verification

**Atomic Swaps**: ZEC (Zcash L1) ↔ USDC (Starknet) trustlessly.

## Competitive Landscape

| Solution | Counterparty Risk | Front-running | KYC Required | Cross-chain |
|----------|-------------------|---------------|--------------|-------------|
| **Traditional OTC Desks** | ❌ High | ❌ Yes (desk sees orders) | ✅ Yes | ❌ No |
| **Escrow Services** | ⚠️ Medium | ⚠️ Possible | ✅ Yes | ⚠️ Limited |
| **DEX Aggregators** | ✅ None | ❌ Yes (public mempool) | ❌ No | ⚠️ Limited |
| **BlackTrace** | ✅ None (HTLCs) | ✅ No (encrypted) | ❌ No | ✅ Yes |

## Use Cases

### 1. DAO Treasury Management
A DAO votes to diversify 50,000 ZEC into stablecoins. They find a buyer on Discord but don't trust them.

**BlackTrace**: Trustless HTLC swap, on-chain audit trail for governance.

### 2. Privacy Whale
A whale wants to sell 100,000 ZEC without:
- KYC to an OTC desk
- The desk front-running their trade
- Revealing their position size

**BlackTrace**: Encrypted P2P order, atomic settlement, zero leakage.

### 3. Cross-border Institutional Trade
US fund wants to buy ZEC from Asian counterparty. Different jurisdictions, no legal framework.

**BlackTrace**: No legal agreements needed, code is the contract.

## Hackathon Demo Flow

1. **Split-screen UI**: Alice (left) | Bob (right)
2. **Alice**: Logs in, creates encrypted order: "Sell 10,000 ZEC @ $465"
3. **Bob**: Sees encrypted order blob, clicks "Decrypt", views terms
4. **Bob**: Creates encrypted proposal, sends to Alice
5. **Alice**: Decrypts proposal, clicks "Accept"
6. **Settlement Panel**: Shows NATS message → HTLC creation
7. **Timeline**: Visual progress from Order → Proposal → Accepted → Settlement

**Visual Impact**: Judges see encrypted blobs transform into terms, trustless execution.

## Current Demo Limitations

This demo implementation has the following limitations:

### User Roles & Configuration
1. **Single Maker Per Node**: While multiple users can register on the maker node (port 8080), all orders from that node share the same libp2p peer ID. Takers cannot distinguish which user created which order since the `OrderAnnouncement` only contains the node's peer ID, not the maker's username.
   - **Workaround**: Run separate maker nodes for each maker user, or use the current setup with one primary maker per node.

2. **Multiple Takers Supported**: Multiple users can register on the taker node (port 8081) and operate independently. Each taker user can:
   - View encrypted orders targeted to them specifically
   - Create separate encrypted proposals
   - Maintain independent sessions

### Order Types
3. **Sell Orders Only**: The current implementation only supports **sell orders** where the maker sells ZEC for stablecoin.
   - Maker = Always seller of ZEC
   - Taker = Always buyer of ZEC (paying with stablecoin)
   - Buy orders (maker buys ZEC with stablecoin) are not yet implemented.

### Identity & Encryption
4. **Shared Identity Storage Required**: For encrypted order creation to work in Docker, all nodes must share the same identities directory via the `shared-identities` volume. This is configured in `docker-compose.yml` and is necessary for makers to access takers' public keys at order creation time.

5. **Targeted Encryption**: When creating an order with a specific taker username:
   - Order details are encrypted using ECIES with the taker's public key
   - Only the specified taker can decrypt the order details
   - Other users see placeholder values (e.g., `???` for amount)

### Trading & Settlement
6. **No Order Cancellation**: Once an order is created and broadcast, it cannot be cancelled or modified.

7. **No Partial Fills**: Orders are all-or-nothing. Partial fill support is not implemented.

8. **Session Expiry**: User sessions expire after 24 hours and require re-login.

9. **Single Stablecoin Per Order**: Each order can only specify one stablecoin type (USDC, USDT, or DAI). Mixed stablecoin settlements are not supported.

### Settlement Service
10. **HTLC Integration Pending**: The Zcash Orchard and Starknet HTLC smart contracts are in development. Current demo focuses on encrypted negotiation flow.

These limitations are intentional for the demo scope and can be addressed in future iterations.

## Contributing

This is a hackathon project. Contributions welcome after initial demo!

## License

MIT

## Contact

Built for [Hackathon Name] by [Your Team]

---

**TL;DR**: BlackTrace = Trustless OTC trading for crypto whales who found each other on Discord and don't want to get rugged.
