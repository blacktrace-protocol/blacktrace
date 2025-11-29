# BlackTrace for Developers

**Build cross-chain apps without bridge risk.**

Bridges have lost over $2 billion to hacks. Your app's reputation shouldn't depend on a bridge's security. BlackTrace gives you HTLC-based atomic swaps as infrastructure—your users' assets never leave their native chains.

---

## Why Build Bridge-Free?

### The Bridge Problem

Every bridge is a honeypot. When you integrate a bridge SDK, you inherit its risk:

- **Wormhole**: $320M stolen (February 2022)
- **Ronin**: $620M stolen (March 2022)
- **Nomad**: $190M stolen (August 2022)
- **Multichain**: $130M+ frozen (July 2023)

When a bridge gets hacked, apps built on it take the blame. Your users lose funds. Your reputation suffers.

### The BlackTrace Difference

BlackTrace uses **Hash Time-Locked Contracts (HTLCs)** instead of bridges:

| Bridge Architecture | BlackTrace Architecture |
|---------------------|-------------------------|
| Assets move to bridge custody | Assets stay on native chains |
| Trust bridge operators | Trust only cryptography |
| Single exploit = total loss | Atomic: both succeed or both refund |
| Complex multi-sig security | Simple hash lock + timelock |

**Result**: Your app gets cross-chain functionality without cross-chain risk.

---

## What You Can Build

### OTC Trading Platform
Build a Binance OTC competitor without custody risk. Users negotiate privately, settle atomically.

### Cross-Chain DEX Frontend
Offer ZEC↔USDC swaps without liquidity pools. Direct peer-to-peer, negotiated pricing.

### DAO Treasury Tools
Let DAOs diversify holdings across chains with on-chain audit trails and zero counterparty risk.

### Privacy Wallet
Add cross-chain swaps to privacy wallets. No KYC, no order book exposure, no bridge trust.

---

## SDK Overview

### Installation

```bash
npm install @blacktrace/sdk
```

### Quick Start

```typescript
import { BlackTraceSDK } from '@blacktrace/sdk'

// Initialize
const sdk = new BlackTraceSDK({
  makerNodeUrl: 'http://localhost:8080',
  takerNodeUrl: 'http://localhost:8081',
  settlementUrl: 'http://localhost:8090'
})

// Configure chain pair
sdk.configureChainPair({
  source: { id: 'zcash', asset: 'ZEC' },
  destination: { id: 'starknet', asset: 'USDC' }
})

// Authenticate
await sdk.login('alice', 'password')

// Create order
const order = await sdk.createOrder({
  amount: 1.0,
  minPrice: 100,
  maxPrice: 150
})
```

### Core API

```typescript
// Orders (Maker)
sdk.createOrder(params)        // Create sell order
sdk.getOrders()                // List my orders

// Proposals (Taker)
sdk.createProposal(params)     // Propose price
sdk.getProposals(orderId)      // List proposals

// Negotiation
sdk.acceptProposal(id, secret) // Accept and start settlement
sdk.rejectProposal(id)         // Reject proposal

// Settlement
sdk.lockSourceAsset(id)        // Lock on source chain
sdk.lockDestinationAsset(id)   // Lock on destination chain
sdk.claimSourceAsset(id)       // Claim with secret
sdk.claimDestinationAsset(id)  // Claim revealed secret

// Status
sdk.getSettlementStatus(id)    // Check settlement state
sdk.watchSettlement(id)        // Real-time updates
```

### Complete Swap Flow

```typescript
// === ALICE (Maker) ===
const sdk = new BlackTraceSDK()
await sdk.login('alice', 'password')

// Create order: Selling 1 ZEC for $100-150 USDC
const order = await sdk.createOrder({
  amount: 1.0,
  minPrice: 100,
  maxPrice: 150
})

// Wait for proposals...
const proposals = await sdk.getProposals(order.id)

// Accept Bob's proposal at $120
await sdk.acceptProposal(proposals[0].id, 'mysecret123')

// Lock ZEC on Zcash
await sdk.lockSourceAsset(proposals[0].id)

// Wait for Bob to lock USDC...

// Claim USDC on Starknet (reveals secret)
await sdk.claimDestinationAsset(proposals[0].id)


// === BOB (Taker) ===
const sdk = new BlackTraceSDK()
await sdk.login('bob', 'password')

// See Alice's order
const orders = await sdk.getOrders()

// Propose $120
const proposal = await sdk.createProposal({
  orderId: orders[0].id,
  price: 120,
  amount: 1.0
})

// Wait for acceptance...

// Lock USDC on Starknet
await sdk.lockDestinationAsset(proposal.id)

// Wait for Alice to claim (reveals secret)...

// Claim ZEC on Zcash using revealed secret
await sdk.claimSourceAsset(proposal.id, 'mysecret123')
```

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Application                        │
│                                                              │
│    ┌──────────────────────────────────────────────────┐    │
│    │              @blacktrace/sdk                      │    │
│    │                                                   │    │
│    │  createOrder()  lockSourceAsset()  claimAsset()  │    │
│    └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   BlackTrace Backend                         │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Maker Node  │◄──►│ Taker Node  │    │ Settlement  │     │
│  │   (Go)      │P2P │   (Go)      │    │  Service    │     │
│  │ Port: 8080  │    │ Port: 8081  │    │ Port: 8090  │     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                  │             │
│         └────────┬─────────┴─────────┬────────┘             │
│                  │                   │                       │
│                  ▼                   ▼                       │
│         ┌────────────────┐  ┌────────────────┐              │
│         │  NATS Server   │  │ Chain Connectors│              │
│         │  (Messaging)   │  │ (Zcash, Starknet)│             │
│         └────────────────┘  └────────────────┘              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Blockchains                             │
│                                                              │
│      ┌──────────────┐              ┌──────────────┐        │
│      │    Zcash     │              │   Starknet   │        │
│      │  HTLC Script │              │ HTLC Contract│        │
│      │  (P2SH)      │              │   (Cairo)    │        │
│      └──────────────┘              └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Settlement Flow

```
Time ──────────────────────────────────────────────────────►

Alice                    BlackTrace                     Bob
  │                          │                           │
  │  1. Accept proposal      │                           │
  │  ─────────────────────►  │                           │
  │                          │                           │
  │  2. Lock ZEC (HTLC)      │                           │
  │  ─────────────────────►  │                           │
  │                          │  3. Notify Bob            │
  │                          │  ────────────────────────►│
  │                          │                           │
  │                          │  4. Lock USDC (HTLC)      │
  │                          │  ◄────────────────────────│
  │  5. Both locked          │                           │
  │  ◄─────────────────────  │  ────────────────────────►│
  │                          │                           │
  │  6. Claim USDC           │                           │
  │     (reveals secret)     │                           │
  │  ─────────────────────►  │                           │
  │                          │  7. Secret visible        │
  │                          │  ────────────────────────►│
  │                          │                           │
  │                          │  8. Claim ZEC             │
  │                          │  ◄────────────────────────│
  │                          │                           │
  ▼                          ▼                           ▼
DONE                       DONE                        DONE
```

---

## Adding New Chains

BlackTrace is designed to be chain-agnostic. Add support for any chain that can implement hash locks.

### Chain Connector Interface

```go
type ChainConnector interface {
    // Create HTLC with given parameters
    CreateHTLC(params HTLCParams) (HTLCResult, error)

    // Claim HTLC by revealing secret
    ClaimHTLC(params ClaimParams) (TxResult, error)

    // Refund HTLC after timeout
    RefundHTLC(params RefundParams) (TxResult, error)

    // Watch for HTLC events
    WatchHTLC(htlcId string) (<-chan HTLCEvent, error)

    // Get chain-specific info
    GetChainInfo() ChainInfo
}

type HTLCParams struct {
    SecretHash        []byte        // RIPEMD160(SHA256(secret))
    RecipientPubKey   []byte        // Who can claim with secret
    RefundPubKey      []byte        // Who can refund after timeout
    Amount            *big.Int      // Amount to lock
    Timelock          time.Duration // Lock duration
}
```

### Example: Adding Solana

```go
// connectors/solana/connector.go
type SolanaConnector struct {
    rpcClient  *rpc.Client
    htlcProgram solana.PublicKey
}

func (c *SolanaConnector) CreateHTLC(params HTLCParams) (HTLCResult, error) {
    // Build instruction to invoke HTLC program
    ix := htlc.NewCreateInstruction(
        params.SecretHash,
        params.RecipientPubKey,
        params.RefundPubKey,
        params.Amount,
        params.Timelock,
    )

    // Send transaction
    tx, err := c.rpcClient.SendTransaction(ctx, ix)
    if err != nil {
        return HTLCResult{}, err
    }

    return HTLCResult{
        TxID:     tx.String(),
        HTLCAddr: htlcAddress,
    }, nil
}
```

### Register Chain in Config

```yaml
# config/chains.yaml
chains:
  solana:
    type: "account"
    htlc_type: "anchor_program"
    rpc_url: "${SOLANA_RPC_URL}"
    htlc_program: "HTLCProgram111111111111111111111111111111111"
    hash_algorithm: "sha256"  # Solana uses raw SHA256
```

### SDK Auto-Discovery

Once registered, the SDK automatically supports the new chain:

```typescript
const chains = await sdk.getSupportedChains()
// ['zcash', 'starknet', 'solana']

sdk.configureChainPair({
  source: { id: 'solana', asset: 'SOL' },
  destination: { id: 'starknet', asset: 'USDC' }
})

// Same API works!
await sdk.lockSourceAsset(proposalId)
```

---

## HTLC Deep Dive

### How Hash Locks Work

```
1. Alice generates random secret S (32 bytes)
2. Alice computes hash H = RIPEMD160(SHA256(S))
3. Alice locks ZEC with script:
   - Bob can claim IF he provides X where RIPEMD160(SHA256(X)) == H
   - Alice can refund IF 24 hours have passed

4. Bob locks USDC with same hash H:
   - Alice can claim IF she provides X where hash(X) == H
   - Bob can refund IF 12 hours have passed

5. Alice claims USDC by revealing S on-chain
6. Bob sees S, uses it to claim ZEC

Key insight: Alice's claim reveals S, enabling Bob's claim.
Timelock asymmetry: Alice's refund is longer, giving Bob time to claim.
```

### Zcash HTLC Script

```
OP_IF
    OP_SHA256 OP_RIPEMD160
    <hash_lock> OP_EQUALVERIFY
    OP_DUP OP_HASH160 <bob_pubkey_hash>
OP_ELSE
    <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP
    OP_DUP OP_HASH160 <alice_pubkey_hash>
OP_ENDIF
OP_EQUALVERIFY OP_CHECKSIG
```

### Security Properties

| Property | Guarantee |
|----------|-----------|
| **Atomicity** | Both claim or both refund—never one without the other |
| **No custody** | Assets locked by cryptography, not a custodian |
| **Timeout safety** | Automatic refund if counterparty disappears |
| **Secret binding** | Same secret unlocks both sides |

---

## Self-Hosting

### Docker Compose

```bash
git clone https://github.com/prabhueshwarla/blacktrace.git
cd blacktrace

# Start all services
./scripts/start.sh full

# Your SDK connects to localhost
const sdk = new BlackTraceSDK({
  makerNodeUrl: 'http://localhost:8080',
  takerNodeUrl: 'http://localhost:8081',
  settlementUrl: 'http://localhost:8090'
})
```

### Production Deployment

```yaml
# docker-compose.prod.yml
services:
  node-maker:
    image: blacktrace/node:latest
    environment:
      - ZCASH_RPC_URL=${ZCASH_MAINNET_RPC}
      - STARKNET_RPC_URL=${STARKNET_MAINNET_RPC}

  settlement-service:
    image: blacktrace/settlement:latest
    environment:
      - ZCASH_NETWORK=mainnet
      - STARKNET_NETWORK=mainnet
```

---

## API Reference

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Register new user |
| `/auth/login` | POST | Get session token |
| `/orders/create` | POST | Create sell order |
| `/orders/list` | GET | List orders |
| `/negotiate/propose` | POST | Submit proposal |
| `/negotiate/accept` | POST | Accept proposal |
| `/settlement/lock` | POST | Lock asset in HTLC |
| `/settlement/claim` | POST | Claim with secret |
| `/settlement/status` | GET | Get settlement status |

### WebSocket Events

```typescript
sdk.watchSettlement(proposalId).on('status', (event) => {
  // event.status: 'ready' | 'alice_locked' | 'bob_locked' |
  //               'both_locked' | 'alice_claimed' | 'complete'
})
```

---

## Support

- **Documentation**: [docs/](https://github.com/prabhueshwarla/blacktrace/tree/main/docs)
- **GitHub Issues**: [github.com/prabhueshwarla/blacktrace/issues](https://github.com/prabhueshwarla/blacktrace/issues)
- **API Reference**: [docs/API.md](../API.md)

---

## License

MIT License - Build freely, deploy anywhere.

---

**BlackTrace: Bridge-free settlement infrastructure for the next generation of cross-chain apps.**
