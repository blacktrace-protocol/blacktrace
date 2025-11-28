# Proposal: BlackTrace JS SDK

## Overview

A TypeScript SDK that wraps the existing Go backend APIs, providing a clean, chain-agnostic interface for building cross-chain atomic swap applications.

## Current vs Proposed Architecture

```
Current:
Frontend (React) → Direct HTTP calls → Go APIs
                   /orders/create
                   /settlement/lock-zec
                   /settlement/claim-zec

Proposed:
Frontend (React) → JS SDK → Go APIs (unchanged)
                   sdk.createOrder()
                   sdk.lockSourceAsset()
                   sdk.claimSourceAsset()
```

---

## Refactoring Effort

| Task | Effort | Description |
|------|--------|-------------|
| Generalize Go API endpoints | 2 days | `/settlement/lock` instead of `/settlement/lock-zec` |
| Add chain config system | 1 day | YAML config, `/chains` endpoint |
| Create JS SDK package | 3 days | Type-safe wrapper around Go APIs |
| Update frontend | 1 day | Replace direct calls with SDK |
| **Total** | **~1 week** | |

---

## Go Backend Changes

### API Generalization

```go
// Current (chain-specific)
POST /settlement/lock-zec
POST /settlement/claim-zec
POST /settlement/lock-usdc

// Proposed (chain-agnostic)
POST /settlement/lock    { chain: "zcash", asset: "ZEC", ... }
POST /settlement/claim   { chain: "zcash", ... }
GET  /chains             // List supported chains
```

### Chain Configuration

```yaml
# config/chains.yaml
chains:
  zcash:
    type: "utxo"
    htlc_type: "bitcoin_script"
    rpc_url: "${ZCASH_RPC_URL}"
    hash_algorithm: "hash160"

  starknet:
    type: "account"
    htlc_type: "cairo_contract"
    rpc_url: "${STARKNET_RPC_URL}"
    htlc_contract: "0x..."

  ethereum:
    type: "account"
    htlc_type: "solidity_contract"
    rpc_url: "${ETH_RPC_URL}"
    htlc_contract: "0x..."
```

---

## JS SDK Design

### Package Structure

```
@blacktrace/sdk/
├── src/
│   ├── index.ts          # Main exports
│   ├── client.ts         # HTTP client wrapper
│   ├── types.ts          # TypeScript interfaces
│   ├── orders.ts         # Order operations
│   ├── proposals.ts      # Proposal operations
│   ├── settlement.ts     # Settlement operations
│   └── chains.ts         # Chain configuration
└── package.json
```

### Core Interface

```typescript
interface BlackTraceConfig {
  makerNodeUrl?: string    // Default: 'http://localhost:8080'
  takerNodeUrl?: string    // Default: 'http://localhost:8081'
  settlementUrl?: string   // Default: 'http://localhost:8090'
}

interface ChainPair {
  source: { id: string, asset: string }
  destination: { id: string, asset: string }
}

class BlackTraceSDK {
  constructor(config?: BlackTraceConfig)

  // Authentication
  register(username: string, password: string): Promise<User>
  login(username: string, password: string): Promise<Session>

  // Chain Management
  getSupportedChains(): Promise<Chain[]>
  configureChainPair(pair: ChainPair): void

  // Orders (Maker)
  createOrder(params: CreateOrderParams): Promise<Order>
  getOrders(): Promise<Order[]>

  // Proposals (Taker)
  createProposal(params: CreateProposalParams): Promise<Proposal>
  getProposals(orderId?: string): Promise<Proposal[]>

  // Negotiation
  acceptProposal(proposalId: string, secret: string): Promise<void>
  rejectProposal(proposalId: string): Promise<void>

  // Settlement
  lockSourceAsset(proposalId: string): Promise<LockResult>
  lockDestinationAsset(proposalId: string): Promise<LockResult>
  claimSourceAsset(proposalId: string, secret: string): Promise<ClaimResult>
  claimDestinationAsset(proposalId: string): Promise<ClaimResult>

  // Status
  getSettlementStatus(proposalId: string): Promise<SettlementStatus>
  watchSettlement(proposalId: string): AsyncIterable<SettlementEvent>

  // Wallets
  createWallet(chain: string): Promise<Wallet>
  getBalance(chain: string): Promise<Balance>
}
```

---

## Usage Example

### Basic Swap Flow

```typescript
import { BlackTraceSDK } from '@blacktrace/sdk'

// Initialize
const sdk = new BlackTraceSDK()

// Configure chain pair
sdk.configureChainPair({
  source: { id: 'zcash', asset: 'ZEC' },
  destination: { id: 'starknet', asset: 'STRK' }
})

// Alice: Create order
await sdk.login('alice', 'password')
const order = await sdk.createOrder({
  amount: 1.0,
  minPrice: 100,
  maxPrice: 150
})

// Bob: Create proposal (different SDK instance)
await sdk.login('bob', 'password')
const proposal = await sdk.createProposal({
  orderId: order.id,
  price: 120,
  amount: 1.0
})

// Alice: Accept and lock
await sdk.acceptProposal(proposal.id, 'mysecret123')
await sdk.lockSourceAsset(proposal.id)

// Bob: Lock
await sdk.lockDestinationAsset(proposal.id)

// Alice: Claim destination
await sdk.claimDestinationAsset(proposal.id)

// Bob: Claim source
await sdk.claimSourceAsset(proposal.id, 'mysecret123')
```

### Before vs After

```typescript
// Before SDK (current)
const response = await fetch('http://localhost:8080/settlement/lock-zec', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    session_id: sessionId,
    proposal_id: proposalId,
    zcash_address: address,
    secret: secret,
    alice_pubkey_hash: alicePKH,
    bob_pubkey_hash: bobPKH
  })
})

// After SDK
await sdk.lockSourceAsset(proposalId)
```

---

## Adding New Chains

### Step 1: Add Go Connector

```go
// connectors/ethereum/htlc.go
type EthereumConnector struct { ... }
func (c *EthereumConnector) CreateHTLC(params HTLCParams) (string, error)
func (c *EthereumConnector) ClaimHTLC(params ClaimParams) (string, error)
```

### Step 2: Register in Config

```yaml
# config/chains.yaml
chains:
  ethereum:
    type: "account"
    htlc_contract: "0x..."
```

### Step 3: SDK Auto-Discovers

```typescript
const chains = await sdk.getSupportedChains()
// ['zcash', 'starknet', 'ethereum']

sdk.configureChainPair({
  source: { id: 'ethereum', asset: 'ETH' },
  destination: { id: 'starknet', asset: 'STRK' }
})
// Works automatically!
```

---

## Building a New Swap App in a Day

### Timeline

| Hour | Task |
|------|------|
| 1-2 | Setup: `npm install @blacktrace/sdk`, configure endpoints |
| 3-4 | Alice flow: createOrder, acceptProposal, lockSourceAsset, claimDestinationAsset |
| 5-6 | Bob flow: createProposal, lockDestinationAsset, claimSourceAsset |
| 7-8 | UI: React forms, status display, balance checking |

### Example: ETH ↔ SOL Swap

```typescript
import { BlackTraceSDK } from '@blacktrace/sdk'

const sdk = new BlackTraceSDK()

// Configure for ETH ↔ SOL
sdk.configureChainPair({
  source: { id: 'ethereum', asset: 'ETH' },
  destination: { id: 'solana', asset: 'SOL' }
})

// Same API as ZEC ↔ STRK!
await sdk.createOrder({ amount: 1.0, minPrice: 2000, maxPrice: 2500 })
await sdk.lockSourceAsset(proposalId)  // Locks ETH
await sdk.claimDestinationAsset(proposalId)  // Claims SOL
```

---

## SDK Benefits

| Feature | Benefit |
|---------|---------|
| Clean API | `sdk.lockSourceAsset()` vs raw HTTP |
| Chain agnostic | Configure once, works for any chain pair |
| Type safety | Full TypeScript definitions |
| Session management | SDK handles auth tokens internally |
| Error handling | Consistent error types |
| Auto-discovery | New chains available automatically |

---

## Implementation Priority

1. **Phase 1**: Generalize Go API endpoints (2 days)
2. **Phase 2**: Create SDK with current ZEC ↔ STRK support (3 days)
3. **Phase 3**: Add chain config system (1 day)
4. **Phase 4**: Update frontend to use SDK (1 day)
5. **Phase 5**: Add new chain connectors as needed (3-5 days per chain)
