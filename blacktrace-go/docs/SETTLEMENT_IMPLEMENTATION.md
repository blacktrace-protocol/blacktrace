# Settlement Implementation Guide

## ⚠️ Critical Architecture Clarification: Wallet Integration

### The Key Question: Who Signs Transactions?

**The Settlement Service CANNOT and SHOULD NOT sign blockchain transactions.** This is crucial to understand:

```
❌ WRONG: Settlement Service holds private keys
   - Massive security risk
   - Defeats "trustless" purpose
   - Single point of failure
   - Users don't control their funds

✅ CORRECT: Users sign their own transactions
   - Private keys stay in user wallets
   - Settlement Service is a COORDINATOR only
   - Fully trustless
   - Standard wallet UX (like MetaMask)
```

### Settlement Service Role: Coordinator, Not Signer

The Settlement Service orchestrates the atomic swap but **never touches private keys**:

**What it DOES:**
- ✅ Generates secret and hash for HTLCs
- ✅ Publishes instructions to Alice and Bob's nodes
- ✅ Monitors blockchains (read-only)
- ✅ Coordinates claim sequence
- ✅ Publishes status updates

**What it DOES NOT do:**
- ❌ Hold private keys
- ❌ Sign transactions
- ❌ Create HTLCs directly
- ❌ Access user wallets

### Transaction Signing Responsibility

| Action | Who Signs | Private Key Location | How |
|--------|-----------|---------------------|-----|
| Create Zcash HTLC | **Alice** | Alice's Zcash wallet | Wallet popup in frontend |
| Create Starknet HTLC | **Bob** | Bob's Starknet wallet (ArgentX) | Wallet popup in frontend |
| Claim USDC | **Alice** | Alice's Starknet wallet | Wallet popup in frontend |
| Claim ZEC | **Bob** | Bob's Zcash wallet | Wallet popup in frontend |

**Settlement Service:** Only monitors and coordinates - **NO PRIVATE KEYS EVER**

---

## Current Architecture Overview

### ✅ What's Already Built

```
┌──────────────┐         ┌──────────────┐
│   Frontend   │         │   Frontend   │
│  (Alice)     │         │    (Bob)     │
└──────┬───────┘         └──────┬───────┘
       │                        │
       │ POST /proposals/accept │
       │                        │
       ▼                        ▼
┌──────────────┐         ┌──────────────┐
│ Go Backend   │◄───P2P──►│ Go Backend   │
│ (Port 8080)  │         │ (Port 8081)  │
│              │         │              │
│ Alice Node   │         │  Bob Node    │
└──────┬───────┘         └──────────────┘
       │
       │ Publish to NATS
       │ settlement.request.<proposal_id>
       ▼
┌──────────────────────────────────────┐
│         NATS Message Broker          │
│            (Port 4222)               │
└──────────────┬───────────────────────┘
               │
               │ Subscribe to
               │ settlement.request.*
               ▼
        ┌──────────────┐
        │ Settlement   │
        │ Service      │
        │ (Rust)       │
        │              │
        │ [LISTENING]  │ ← Currently just logs, no HTLC yet
        └──────────────┘
```

### Components Status

1. **✅ Go Backend (node/app.go)**
   - When Alice accepts a proposal (line 960-999)
   - Publishes `SettlementRequest` to NATS
   - Subject: `settlement.request.<proposal_id>`

2. **✅ Settlement Manager (node/settlement.go)**
   - Connects to NATS on startup
   - Publishes settlement requests
   - Handles reconnection automatically

3. **✅ NATS Broker**
   - Running on port 4222
   - Configured in docker-compose.yml
   - JetStream enabled for persistence

4. **✅ Settlement Service (settlement-service/src/main.rs)**
   - Subscribes to `settlement.request.*`
   - Receives and deserializes requests
   - **Currently**: Just logs the request
   - **Missing**: HTLC creation and monitoring

---

## Settlement Flow Explained

### 1. **Trigger Point: Alice Accepts Proposal**

When Alice clicks "Accept" on a proposal in the frontend:

```
Frontend (Alice) → POST /proposals/:id/accept → Go Backend (Alice)
```

### 2. **Go Backend Processes Acceptance**

Location: `blacktrace-go/node/app.go:965-999`

```go
// Phase 3: Publish settlement request to NATS for HTLC creation
if app.settlementMgr.IsEnabled() {
    settlementReq := SettlementRequest{
        ProposalID:      "proposal_1763749677",
        OrderID:         "order_1763749677",
        MakerID:         "alice_peer_id",
        TakerID:         "bob_peer_id",
        Amount:          10000,  // ZEC in smallest unit
        Price:           465,    // Price in USD
        Stablecoin:      "USDC",
        SettlementChain: "ztarknet",
        Timestamp:       time.Now(),
    }

    app.settlementMgr.PublishSettlementRequest(settlementReq)
}
```

### 3. **NATS Publishes to Settlement Service**

```
Go Backend → NATS (settlement.request.proposal_1763749677) → Rust Settlement Service
```

### 4. **Settlement Service Receives Request**

Location: `settlement-service/src/main.rs:56-94`

Currently logs:
```
📩 NEW SETTLEMENT REQUEST RECEIVED
  Proposal ID:       proposal_1763749677
  Order ID:          order_1763749677

  👥 Parties:
     Maker (Alice):  QmYyQSo1c1Zs...
     Taker (Bob):    QmcZf52FlLXr...

  💰 Trade Details:
     Amount:         10000 ZEC
     Price:          $465
     Stablecoin:     USDC
     Total Value:    $4,650,000

  ⛓️  Settlement:
     ZEC Chain:      Zcash L1 (Orchard)
     Stablecoin:     USDC on ztarknet
```

### 5. **Complete Settlement Flow with Wallet Integration**

Here's the full flow showing how wallets are integrated:

```
1. Alice accepts proposal (Frontend)
   ↓
2. Go Backend → NATS: settlement.request
   ↓
3. Settlement Service receives request
   ↓
4. Settlement Service generates:
   - secret = random_bytes(32)
   - hash = SHA256(secret)
   ↓
5. Settlement Service → NATS → Alice's Node:
   "settlement.instruction.alice_peer_id"
   {
     action: "create_zcash_htlc",
     params: {
       amount: 10000 ZEC,
       hash: 0x123abc...,
       recipient: bob_address,
       timeout: 48h
     }
   }
   ↓
6. Alice's Node → WebSocket → Frontend:
   {
     type: "htlc_creation_required",
     chain: "Zcash",
     params: {...}
   }
   ↓
7. Frontend shows modal:
   "🔐 Sign Transaction to Lock 10,000 ZEC"
   [Approve] [Reject]
   ↓
8. Alice clicks Approve
   ↓
9. Frontend → Zcash Wallet (browser extension or desktop):
   wallet.signTransaction({
     type: "create_htlc",
     amount: 10000,
     hash: 0x123abc...,
     ...
   })
   ↓
10. Zcash Wallet shows popup:
    "Approve locking 10,000 ZEC?"
    [Confirm] [Cancel]
    ↓
11. Alice enters password → Wallet signs transaction
    ↓
12. Signed TX broadcast to Zcash network
    ↓
13. Settlement Service monitors Zcash blockchain:
    "✅ HTLC created! TX: 0xzcash_tx_hash"
    ↓
14. Settlement Service → NATS → Bob's Node:
    "settlement.instruction.bob_peer_id"
    {
      action: "create_starknet_htlc",
      params: {
        amount: $4.65M USDC,
        hash: 0x123abc... (same hash!),
        recipient: alice_address,
        timeout: 24h
      }
    }
    ↓
15. Bob's Node → WebSocket → Frontend:
    {
      type: "htlc_creation_required",
      chain: "Starknet",
      params: {...}
    }
    ↓
16. Frontend shows modal:
    "🔐 Sign Transaction to Lock $4,650,000 USDC"
    [Approve] [Reject]
    ↓
17. Bob clicks Approve
    ↓
18. Frontend → ArgentX (Starknet wallet):
    wallet.signTransaction({
      type: "create_htlc",
      amount: 4650000,
      ...
    })
    ↓
19. ArgentX shows popup:
    "Approve locking $4,650,000 USDC?"
    [Confirm] [Cancel]
    ↓
20. Bob confirms → Wallet signs transaction
    ↓
21. Signed TX broadcast to Starknet
    ↓
22. Settlement Service monitors Starknet:
    "✅ Both HTLCs created!"
    ↓
23. Settlement Service → NATS → Alice's Node:
    "settlement.instruction.alice_peer_id"
    {
      action: "claim_usdc",
      secret: 0xsecret123...,
      starknet_htlc_address: 0x...
    }
    ↓
24. Alice's Frontend → ArgentX:
    "🔐 Sign Transaction to Claim $4,650,000 USDC"
    ↓
25. Alice signs → Secret revealed on Starknet blockchain
    ↓
26. Settlement Service monitors Starknet:
    "✅ Alice claimed USDC! Secret revealed: 0xsecret123..."
    ↓
27. Settlement Service → NATS → Bob's Node:
    "settlement.instruction.bob_peer_id"
    {
      action: "claim_zec",
      secret: 0xsecret123...,
      zcash_htlc_address: 0x...
    }
    ↓
28. Bob's Frontend → Zcash Wallet:
    "🔐 Sign Transaction to Claim 10,000 ZEC"
    ↓
29. Bob signs → Claims ZEC
    ↓
30. Settlement Service:
    "✅ ATOMIC SWAP COMPLETE"
    - Alice received $4,650,000 USDC
    - Bob received 10,000 ZEC
```

**Key Points:**
- Settlement Service never holds keys - only sends instructions
- Users approve every transaction in their wallets
- Standard wallet UX (like MetaMask popups)
- Fully trustless - users control funds at all times

---

## What's Missing: HTLC Implementation

### Hash Time-Locked Contracts (HTLCs)

HTLCs enable **atomic swaps** - both trades complete or both fail, with zero counterparty risk.

### The Problem HTLCs Solve

**Without HTLCs:**
- Alice sends ZEC first → Bob might not send USDC (Alice loses money)
- Bob sends USDC first → Alice might not send ZEC (Bob loses money)
- Need to trust each other ❌

**With HTLCs:**
- Both lock funds in smart contracts with the same hash secret
- Alice reveals secret to claim USDC → Bob sees secret and claims ZEC
- Or both get refunds after timeout
- **Zero counterparty risk** ✅

---

## HTLC Atomic Swap Flow

### Phase 1: Secret Generation
```
Settlement Service generates:
  - Random secret: `s = random_bytes(32)`
  - Hash of secret: `h = SHA256(s)`
```

### Phase 2: Alice Locks ZEC (Maker)

```
Zcash L1 (Orchard Pool)
┌─────────────────────────────────────┐
│  Alice's HTLC Contract              │
├─────────────────────────────────────┤
│  Amount: 10,000 ZEC                 │
│  Hash: h                            │
│  Recipient: Bob                     │
│  Refund: Alice (after 48 hours)     │
│                                     │
│  Unlock conditions:                 │
│  1. Bob provides secret s           │
│     where SHA256(s) == h            │
│  OR                                 │
│  2. Alice reclaims after timeout    │
└─────────────────────────────────────┘
```

**Alice's ZEC is now locked.** Bob can't steal it (doesn't know secret).

### Phase 3: Bob Locks USDC (Taker)

```
zTarknet (Starknet)
┌─────────────────────────────────────┐
│  Bob's HTLC Contract                │
├─────────────────────────────────────┤
│  Amount: $4,650,000 USDC            │
│  Hash: h (same as Zcash)            │
│  Recipient: Alice                   │
│  Refund: Bob (after 24 hours)       │
│                                     │
│  Unlock conditions:                 │
│  1. Alice provides secret s         │
│     where SHA256(s) == h            │
│  OR                                 │
│  2. Bob reclaims after timeout      │
└─────────────────────────────────────┘
```

**Bob's USDC is now locked.** Both funds are in HTLCs with the **same hash**.

**Key Detail:** Bob's timeout (24h) < Alice's timeout (48h)
- Ensures Bob can't get rugged if Alice doesn't reveal

### Phase 4: Alice Claims USDC (Reveals Secret)

```
Alice → zTarknet HTLC: claim(secret = s)

zTarknet HTLC verifies:
  ✓ SHA256(s) == h
  ✓ Recipient == Alice

→ Transfer $4,650,000 USDC to Alice
→ Secret `s` is now PUBLIC on blockchain
```

### Phase 5: Bob Claims ZEC (Uses Revealed Secret)

```
Bob monitors zTarknet → sees Alice's claim → extracts secret `s`

Bob → Zcash L1 HTLC: claim(secret = s)

Zcash HTLC verifies:
  ✓ SHA256(s) == h
  ✓ Recipient == Bob

→ Transfer 10,000 ZEC to Bob
```

### Result: Atomic Swap Complete ✅

- Alice gets $4,650,000 USDC
- Bob gets 10,000 ZEC
- **Both or neither** - no way to cheat

---

## ⭐ User-Initiated Settlement (Recommended Approach)

### Why User-Initiated?

**The Problem with Auto-Triggered Settlement:**
- ❌ User might not be at their screen when wallet popup appears
- ❌ Unexpected wallet requests are bad UX
- ❌ Creates timeout risk if user is away
- ❌ No control over when settlement starts

**The Solution: Let Users Start When Ready:**
- ✅ Alice clicks "Lock ZEC" when she's ready
- ✅ Bob clicks "Lock USDC" when he's ready
- ✅ Clear, intentional actions
- ✅ No surprise popups
- ✅ Better UX

### Settlement Tabs in UI

Each user gets a dedicated **Settlement tab** in their panel:

**Alice's Panel Tabs:**
```
[Create Order] [My Orders] [Incoming Proposals] [Settlement]
```

**Bob's Panel Tabs:**
```
[Available Orders] [My Proposals] [Settlement]
```

**Global Settlement Queue (Bottom):**
- Shows proposals where BOTH sides locked
- Displays claim buttons when ready

### Complete User-Initiated Flow

```
┌─────────────────────────────────────────────────────────────┐
│          USER-INITIATED SETTLEMENT FLOW (RECOMMENDED)        │
└─────────────────────────────────────────────────────────────┘

STEP 1: Proposal Accepted
─────────────────────────────
Alice accepts proposal in "Incoming Proposals" tab
    ↓
Proposal moves to Alice's "Settlement" tab
Status: settlement_status = "ready"

┌──────────────────────────────────────┐
│ Alice's "Settlement" Tab             │
├──────────────────────────────────────┤
│ Proposal #abc123                     │
│ Amount: 10,000 ZEC for $4.65M USDC   │
│ Status: Ready to Lock                │
│ [Lock 10,000 ZEC] ← Alice clicks    │
└──────────────────────────────────────┘

STEP 2: Alice Locks ZEC (When Ready)
─────────────────────────────
Alice clicks "Lock 10,000 ZEC"
    ↓
Frontend → Zcash Wallet: "Sign transaction to lock 10,000 ZEC"
    ↓
Alice approves in wallet popup
    ↓
Transaction broadcast to Zcash network
    ↓
Settlement Service monitors blockchain
    ↓
Sees Alice's HTLC created ✅

Status updates to: settlement_status = "alice_locked"

┌──────────────────────────────────────┐
│ Alice's "Settlement" Tab             │
├──────────────────────────────────────┤
│ Proposal #abc123                     │
│ Status: ✅ ZEC Locked                │
│ Waiting for Bob to lock USDC...     │
└──────────────────────────────────────┘

STEP 3: Proposal Moves to Bob's Panel
─────────────────────────────
Settlement Service → NATS → Bob's Node:
  "Alice locked ZEC for proposal #abc123"
    ↓
Proposal appears in Bob's "Settlement" tab

┌──────────────────────────────────────┐
│ Bob's "Settlement" Tab               │
├──────────────────────────────────────┤
│ Proposal #abc123                     │
│ Alice locked 10,000 ZEC ✅           │
│ Your turn: Lock $4.65M USDC          │
│ [Lock $4,650,000 USDC] ← Bob clicks │
└──────────────────────────────────────┘

STEP 4: Bob Locks USDC (When Ready)
─────────────────────────────
Bob clicks "Lock $4,650,000 USDC"
    ↓
Frontend → ArgentX (Starknet wallet): "Sign transaction"
    ↓
Bob approves in wallet popup
    ↓
Transaction broadcast to Starknet
    ↓
Settlement Service monitors blockchain
    ↓
Sees Bob's HTLC created ✅

Status updates to: settlement_status = "both_locked"

STEP 5: Moves to Global Settlement Queue
─────────────────────────────
Proposal disappears from Alice's "Settlement" tab
Proposal disappears from Bob's "Settlement" tab
    ↓
Proposal appears in global "Settlement Queue" (bottom)

┌──────────────────────────────────────┐
│ Settlement Queue (Global)            │
├──────────────────────────────────────┤
│ Proposal #abc123                     │
│ Alice: 10,000 ZEC locked ✅          │
│ Bob: $4.65M USDC locked ✅           │
│ Status: Ready to Claim               │
│                                      │
│ [Claim USDC] (Alice's button)       │
│ [Claim ZEC] (Bob's button)          │
└──────────────────────────────────────┘

STEP 6: Claims (Coordinated by Settlement Service)
─────────────────────────────
Settlement Service → Alice: "Claim your USDC with secret..."
    ↓
Alice clicks "Claim USDC"
    ↓
Wallet popup → Alice signs claim transaction
    ↓
Secret revealed on Starknet blockchain
    ↓
Settlement Service sees secret
    ↓
Settlement Service → Bob: "Secret revealed! Claim your ZEC"
    ↓
Bob clicks "Claim ZEC"
    ↓
Wallet popup → Bob signs claim transaction
    ↓
✅ ATOMIC SWAP COMPLETE
```

### Proposal Lifecycle with Settlement Tabs

```
┌─────────────────────────────────────────────────────────┐
│            PROPOSAL STATES & TAB LOCATIONS               │
└─────────────────────────────────────────────────────────┘

State: pending
├─ Location: Alice's "Incoming Proposals" tab
├─ Action: Alice can Accept/Reject
└─ Bob sees: "My Proposals" tab (waiting)

    ↓ Alice clicks "Accept"

State: accepted, settlement_status: ready
├─ Location: Alice's "Settlement" tab
├─ Action: Alice can "Lock ZEC"
└─ Bob sees: Nothing yet

    ↓ Alice clicks "Lock ZEC" → Signs in wallet

State: accepted, settlement_status: alice_locked
├─ Location: Alice's "Settlement" tab (read-only status)
├─ Action: Waiting for Bob
├─ Location: Bob's "Settlement" tab
└─ Action: Bob can "Lock USDC"

    ↓ Bob clicks "Lock USDC" → Signs in wallet

State: accepted, settlement_status: both_locked
├─ Location: Global "Settlement Queue" (bottom)
├─ Action: Alice can "Claim USDC"
└─ Action: Bob can "Claim ZEC" (after Alice)

    ↓ Alice claims → Bob claims

State: accepted, settlement_status: complete
└─ Location: History (future feature)
```

### Visual Layout

```
┌─────────────────────────────────────────────────────────┐
│                    Alice (Maker)                         │
├─────────────────────────────────────────────────────────┤
│ [Create Order] [My Orders] [Proposals] [Settlement (2)] │
├─────────────────────────────────────────────────────────┤
│  Settlement - Action Required                           │
│                                                          │
│  ┌─────────────────────────────────────┐               │
│  │ Proposal #abc123                    │               │
│  │ 10,000 ZEC for $4.65M USDC          │               │
│  │ Status: Ready to Lock               │               │
│  │ [Lock 10,000 ZEC] 🔐                │               │
│  └─────────────────────────────────────┘               │
│                                                          │
│  ┌─────────────────────────────────────┐               │
│  │ Proposal #def456                    │               │
│  │ 5,000 ZEC for $2.3M USDC            │               │
│  │ Status: ✅ ZEC Locked               │               │
│  │ Waiting for Bob...                  │               │
│  └─────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                     Bob (Taker)                          │
├─────────────────────────────────────────────────────────┤
│ [Available Orders] [My Proposals] [Settlement (1)]      │
├─────────────────────────────────────────────────────────┤
│  Settlement - Action Required                           │
│                                                          │
│  ┌─────────────────────────────────────┐               │
│  │ Proposal #def456                    │               │
│  │ Alice locked 5,000 ZEC ✅           │               │
│  │ Your turn: Lock $2.3M USDC          │               │
│  │ [Lock $2,300,000 USDC] 🔐           │               │
│  └─────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│            Settlement Queue (Global) 1                   │
├─────────────────────────────────────────────────────────┤
│  Both Sides Locked - Ready for Claims                   │
│                                                          │
│  ┌─────────────────────────────────────┐               │
│  │ Proposal #abc123                    │               │
│  │ Alice: 10,000 ZEC locked ✅         │               │
│  │ Bob: $4.65M USDC locked ✅          │               │
│  │                                      │               │
│  │ [Claim USDC] (Alice)                │               │
│  │ [Claim ZEC] (Bob)                   │               │
│  └─────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

### Key Benefits

| Feature | Auto-Triggered | User-Initiated ✅ |
|---------|---------------|-------------------|
| **User Control** | No - automatic | Yes - click button |
| **Wallet Popups** | Unexpected | Expected (user clicked) |
| **UX** | Confusing | Clear and intentional |
| **Timeout Risk** | High (user might be away) | Low (user is present) |
| **Tab Organization** | Single queue | Dedicated tabs |
| **Visibility** | Mixed statuses | Clear progression |
| **Implementation** | Complex (proactive) | Simpler (reactive) |

**Conclusion:** User-initiated settlement is the recommended approach for BlackTrace.

---

## Wallet Integration Architecture Options

There are three approaches to implementing wallet integration, each with tradeoffs:

### Option 1: Full Wallet Integration (Recommended for Production) ✅

**Architecture:**
```
Settlement Service (Rust)
    ↓ (NATS instructions)
Go Backend Nodes
    ↓ (WebSocket)
Frontend
    ↓ (Wallet API)
User Wallets (ArgentX, Zcash Wallet)
    ↓ (User approves)
Blockchain
```

**Implementation:**
```typescript
// Frontend wallet integration
const createHTLC = async (params) => {
  // Connect to Starknet wallet (ArgentX)
  const starknetWallet = await connect({ modalMode: "alwaysAsk" });

  // Request signature
  const tx = await starknetWallet.account.execute({
    contractAddress: HTLC_CONTRACT_ADDRESS,
    entrypoint: "create_htlc",
    calldata: [
      params.amount,
      params.hash,
      params.recipient,
      params.timeout
    ]
  });

  // Wait for transaction confirmation
  await starknetWallet.provider.waitForTransaction(tx.transaction_hash);
};
```

**Pros:**
- ✅ Fully trustless - users control private keys
- ✅ Standard wallet UX (familiar to crypto users)
- ✅ No backend security risk
- ✅ Production-ready architecture
- ✅ Works with existing wallet ecosystems

**Cons:**
- ❌ Requires wallet integration development
- ❌ Users must have wallets installed
- ❌ More complex UX flow
- ❌ Wallet popup friction

**When to use:** Production deployment, when trustlessness is critical

---

### Option 2: Backend-Managed Wallets (Simpler, Less Secure) ⚠️

**Architecture:**
```
Settlement Service (Rust)
    ↓ (NATS instructions)
Go Backend Nodes (holds wallet keys)
    ↓ (Auto-signs transactions)
Blockchain
```

**Implementation:**
```go
// Backend with wallet access
type WalletManager struct {
    zcashWallet    *ZcashWallet
    starknetWallet *StarknetWallet
}

func (wm *WalletManager) CreateZcashHTLC(params HTLCParams) error {
    // Backend signs transaction automatically
    signedTx := wm.zcashWallet.SignHTLCCreation(params)
    return wm.zcashWallet.Broadcast(signedTx)
}
```

**Pros:**
- ✅ Simpler implementation
- ✅ No wallet popups - automatic signing
- ✅ Faster UX - no user approval needed
- ✅ Easier testing

**Cons:**
- ❌ Backend must store private keys (security risk)
- ❌ Not fully trustless
- ❌ Single point of failure
- ❌ Users don't control their funds
- ❌ Regulatory compliance issues

**When to use:** Internal testing, demo mode (testnet only), trusted environment

---

### Option 3: Mock/Simulation Mode (Demo-Friendly) 🎭

**Architecture:**
```
Settlement Service (Rust)
    ↓ (NATS instructions)
Go Backend Nodes
    ↓ (WebSocket)
Frontend
    ↓ (No real blockchain)
Mock HTLCs (in-memory simulation)
```

**Implementation:**
```rust
// Mock HTLC manager
pub struct MockHTLCManager {
    htlcs: HashMap<String, MockHTLC>,
}

impl MockHTLCManager {
    async fn create_htlc(&mut self, params: HTLCParams) -> Result<String> {
        let htlc_id = generate_id();

        // Log instead of real blockchain
        info!("✅ Mock HTLC created on {}", params.chain);
        info!("   ID: {}", htlc_id);
        info!("   Amount: {}", params.amount);
        info!("   Hash: {}", params.hash);

        // Store in memory
        self.htlcs.insert(htlc_id.clone(), MockHTLC {
            params,
            status: "locked",
            created_at: Utc::now(),
        });

        Ok(htlc_id)
    }
}
```

**Pros:**
- ✅ Very fast to implement
- ✅ No blockchain required
- ✅ No wallet needed
- ✅ Perfect for UI/UX demos
- ✅ Test coordination logic

**Cons:**
- ❌ Not real settlement
- ❌ Just a simulation
- ❌ Can't verify actual atomicity
- ❌ No smart contract testing

**When to use:** Initial development, UI demos, coordination flow testing

---

### Recommended Implementation Path

**Phase 1: Mock Mode (Week 1-2)**
- Implement mock HTLC simulation
- Test coordination flow
- Build frontend UI
- **Deliverable:** Working demo with simulated settlement

**Phase 2: Backend Wallets - Testnet (Week 3-4)**
- Add Zcash testnet wallet
- Add Starknet testnet wallet
- Test real HTLC creation
- **Deliverable:** Real testnet settlements

**Phase 3: Full Wallet Integration - Mainnet (Week 5+)**
- Integrate ArgentX for Starknet
- Integrate Zcash wallet extension
- Add transaction approval UX
- **Deliverable:** Production-ready, trustless settlement

---

### Component Responsibilities by Option

| Component | Mock Mode | Backend Wallets | Full Wallet Integration |
|-----------|-----------|-----------------|------------------------|
| **Settlement Service** | Generates instructions, logs mock HTLCs | Generates instructions, monitors blockchain | Generates instructions, monitors blockchain |
| **Go Backend** | Receives instructions, notifies frontend | Receives instructions, **signs transactions**, broadcasts | Receives instructions, notifies frontend |
| **Frontend** | Shows "Settlement in progress" | Shows transaction status | **Wallet popups**, user approves |
| **Wallets** | N/A | Backend-controlled | **User-controlled** |
| **Private Keys** | N/A | **Backend** (risky) | **User wallets** (secure) |

---

## Implementation Plan

### Step 1: Add Blockchain Client Dependencies

**For Zcash (Orchard):**
```toml
# settlement-service/Cargo.toml
[dependencies]
zcash_client_backend = "0.12"
zcash_primitives = "0.15"
orchard = "0.9"  # For Orchard pool
```

**For Starknet (zTarknet):**
```toml
starknet = "0.11"
starknet-crypto = "0.7"
```

### Step 2: Implement HTLC Logic Module

Create: `settlement-service/src/htlc.rs`

```rust
pub struct HTLCManager {
    zcash_client: ZcashClient,
    starknet_client: StarknetClient,
}

impl HTLCManager {
    pub async fn initiate_swap(&self, request: SettlementRequest) -> Result<HTLCSwap> {
        // 1. Generate secret and hash
        let secret = generate_secret();
        let hash = sha256(secret);

        // 2. Create Zcash HTLC (Alice locks ZEC)
        let zcash_htlc = self.create_zcash_htlc(
            amount: request.amount,
            recipient: request.taker_id,
            hash: hash,
            timeout: 48_hours,
        ).await?;

        // 3. Create Starknet HTLC (Bob locks USDC)
        let starknet_htlc = self.create_starknet_htlc(
            amount: request.amount * request.price,
            recipient: request.maker_id,
            hash: hash,
            timeout: 24_hours,
        ).await?;

        // 4. Monitor both HTLCs
        tokio::spawn(self.monitor_swap(zcash_htlc, starknet_htlc, secret));

        Ok(HTLCSwap { zcash_htlc, starknet_htlc })
    }

    async fn monitor_swap(&self, zcash_htlc, starknet_htlc, secret) {
        // Wait for Bob to lock USDC
        // Then reveal secret to claim USDC
        // Monitor Bob claiming ZEC
        // Update settlement status via NATS
    }
}
```

### Step 3: Integrate HTLC into Settlement Service

Update: `settlement-service/src/main.rs`

```rust
// Add HTLC manager
let htlc_manager = HTLCManager::new(zcash_client, starknet_client).await?;

// Process settlement requests
while let Some(message) = subscriber.next().await {
    match serde_json::from_slice::<SettlementRequest>(&message.payload) {
        Ok(request) => {
            info!("📩 NEW SETTLEMENT REQUEST");

            // Initiate HTLC swap
            match htlc_manager.initiate_swap(request).await {
                Ok(swap) => {
                    info!("✅ HTLC swap initiated");
                    info!("   Zcash HTLC: {}", swap.zcash_htlc.txid);
                    info!("   Starknet HTLC: {}", swap.starknet_htlc.txid);
                }
                Err(e) => {
                    error!("❌ Failed to initiate swap: {}", e);
                }
            }
        }
        Err(e) => error!("Failed to deserialize: {}", e),
    }
}
```

### Step 4: Add Settlement Status Updates

Publish status back to NATS for frontend to display:

```rust
// Publish status updates
let status = SettlementStatus {
    proposal_id: request.proposal_id,
    status: "htlc_created",
    zcash_txid: zcash_htlc.txid,
    starknet_txid: starknet_htlc.txid,
    timestamp: Utc::now(),
};

client.publish("settlement.status", serde_json::to_vec(&status)?).await?;
```

### Step 5: Frontend Monitoring (Future Enhancement)

Add settlement status display in frontend:

```typescript
// Poll settlement status
const response = await aliceAPI.getSettlementStatus(proposalId);

// Display:
// - HTLC created on Zcash
// - HTLC created on Starknet
// - Alice claimed USDC
// - Bob claimed ZEC
// - Swap complete ✅
```

---

## Smart Contract Requirements

### Zcash L1 HTLC (Orchard)

**Note:** Zcash Orchard doesn't have smart contracts yet. Two options:

**Option 1: Use Zcash Transparent Pool (temporary)**
- HTLCs are possible in transparent pool
- Less private but functional for demo

**Option 2: Wait for ZSAs (Zcash Shielded Assets)**
- Future Zcash upgrade will enable programmability
- For now, use Option 1

**Transparent Pool HTLC:**
```
HTLC Script:
  IF SHA256(secret) == hash AND recipient_sig
    THEN release_to_recipient
  ELSE IF timeout AND refund_sig
    THEN release_to_sender
```

### Starknet (zTarknet) HTLC

Deploy Cairo smart contract:

```cairo
#[starknet::contract]
mod HTLC {
    #[storage]
    struct Storage {
        hash: felt252,
        recipient: ContractAddress,
        refund_address: ContractAddress,
        amount: u256,
        timeout: u64,
        claimed: bool,
    }

    #[external(v0)]
    fn claim(ref self: ContractState, secret: felt252) {
        // Verify SHA256(secret) == hash
        // Transfer amount to recipient
        // Set claimed = true
    }

    #[external(v0)]
    fn refund(ref self: ContractState) {
        // Verify timeout passed
        // Verify not claimed
        // Transfer amount back to refund_address
    }
}
```

---

## Testing Strategy

### Phase 1: Mock HTLCs
```rust
// For initial testing without blockchain
pub struct MockHTLC {
    // Simulate HTLC without real blockchain
}
```

### Phase 2: Testnet Deployment
- Deploy to Zcash testnet
- Deploy to Starknet Sepolia (testnet)
- Test full flow with test tokens

### Phase 3: Mainnet
- Audit smart contracts
- Deploy to production
- Start with small trades

---

## Implementation Timeline

### Week 1: Setup & Dependencies
- [ ] Add Zcash client library
- [ ] Add Starknet client library
- [ ] Set up testnet connections
- [ ] Create HTLC module structure

### Week 2: Zcash HTLC
- [ ] Implement transparent pool HTLC
- [ ] Create HTLC transaction builder
- [ ] Test locking and claiming ZEC

### Week 3: Starknet HTLC
- [ ] Write Cairo HTLC contract
- [ ] Deploy to Starknet testnet
- [ ] Implement contract interactions

### Week 4: Integration
- [ ] Connect HTLCs with same hash
- [ ] Implement monitoring logic
- [ ] Handle claim/refund flows
- [ ] Add status updates to NATS

### Week 5: Testing & Refinement
- [ ] End-to-end testnet testing
- [ ] Error handling & edge cases
- [ ] Frontend settlement status display
- [ ] Documentation

---

## Key Security Considerations

### 1. Timeout Configuration
- Starknet timeout < Zcash timeout (24h < 48h)
- Prevents Alice from claiming USDC after Bob's timeout

### 2. Secret Generation
- Use cryptographically secure random
- Never reuse secrets

### 3. Monitoring
- Watch for claims on both chains
- Automatic refund if timeout approaching

### 4. Amount Verification
- Double-check amounts match proposal
- Prevent wrong amount attacks

### 5. Hash Consistency
- Same hash on both chains
- Verify hash matches before creating HTLCs

---

## Current vs. Future State

### Current (Demo)
```
Proposal Accepted → Settlement Queue → [Manual process]
```

### After HTLC Implementation
```
Proposal Accepted → NATS → Settlement Service → HTLCs Created
                                              → Monitor Claims
                                              → Atomic Swap Complete ✅
```

---

## Questions & Answers

### Q1: How will Alice authorize and sign transaction to lock ZEC into HTLC?

**A:** Alice uses her **own Zcash wallet** to sign the transaction. The Settlement Service **never** has access to her private keys.

**Step-by-step flow:**

1. **Alice accepts proposal** in frontend → Go backend publishes to NATS
2. **Settlement Service** generates HTLC parameters (amount, hash, timeout)
3. **Settlement Service → NATS** publishes instruction: `settlement.instruction.alice_peer_id`
   ```json
   {
     "action": "create_zcash_htlc",
     "params": {
       "amount": 10000,
       "hash": "0x123abc...",
       "recipient": "bob_zcash_address",
       "timeout": 48
     }
   }
   ```
4. **Go Backend (Alice)** subscribes to instructions, receives it
5. **Go Backend → WebSocket → Frontend**: Notify Alice of pending HTLC
6. **Frontend shows modal**: "🔐 Sign Transaction to Lock 10,000 ZEC"
7. **Alice clicks "Approve"**
8. **Frontend → Zcash Wallet** (browser extension or desktop wallet):
   ```typescript
   const tx = await zcashWallet.signTransaction({
     type: "create_htlc",
     amount: 10000,
     hash: "0x123abc...",
     recipient: "bob_address",
     timeout: 172800 // 48 hours in seconds
   });
   ```
9. **Zcash Wallet popup**: "Approve locking 10,000 ZEC?" → Alice enters password
10. **Wallet signs** transaction with Alice's private key (stays in wallet)
11. **Signed transaction broadcast** to Zcash network
12. **Settlement Service monitors** Zcash blockchain (read-only): "✅ HTLC created!"

**Key points:**
- ✅ Alice's private key **never leaves her wallet**
- ✅ Settlement Service **cannot** create HTLC without Alice's approval
- ✅ Standard wallet UX (like MetaMask)
- ✅ Fully trustless

---

### Q2: How will Bob authorize and sign transaction to lock USDC on Starknet HTLC?

**A:** Bob uses his **Starknet wallet (ArgentX or Braavos)** to sign the transaction. Same flow as Alice, but on Starknet.

**Step-by-step flow:**

1. **Settlement Service monitors Zcash** → sees Alice's HTLC created
2. **Settlement Service → NATS** publishes instruction: `settlement.instruction.bob_peer_id`
   ```json
   {
     "action": "create_starknet_htlc",
     "params": {
       "amount": 4650000,
       "hash": "0x123abc...", // SAME HASH as Alice!
       "recipient": "alice_starknet_address",
       "timeout": 24
     }
   }
   ```
3. **Go Backend (Bob)** receives instruction via NATS subscription
4. **Go Backend → WebSocket → Frontend**: Notify Bob
5. **Frontend shows modal**: "🔐 Sign Transaction to Lock $4,650,000 USDC"
6. **Bob clicks "Approve"**
7. **Frontend → ArgentX (Starknet wallet)**:
   ```typescript
   const starknetWallet = await connect({ modalMode: "alwaysAsk" });

   const tx = await starknetWallet.account.execute({
     contractAddress: HTLC_CONTRACT_ADDRESS,
     entrypoint: "create_htlc",
     calldata: [
       params.amount,
       params.hash,
       params.recipient,
       params.timeout
     ]
   });
   ```
8. **ArgentX popup**: "Approve locking $4,650,000 USDC?" → Bob approves
9. **Wallet signs** transaction with Bob's private key
10. **Signed transaction broadcast** to Starknet
11. **Settlement Service monitors** Starknet: "✅ Both HTLCs created! Ready to claim."

**Key points:**
- ✅ Bob's private key **never leaves his wallet**
- ✅ Bob sees Alice locked ZEC **before** he locks USDC (security)
- ✅ Same hash ensures atomic swap
- ✅ Fully trustless

---

### Q3: How will settlement service coordinate this with the wallets?

**A:** Settlement Service acts as a **coordinator**, not a signer. It orchestrates the swap by:

**What Settlement Service DOES:**

1. **Generates secret and hash**
   ```rust
   let secret = generate_random_bytes(32);
   let hash = sha256(secret);
   ```

2. **Publishes instructions via NATS** (NOT creates HTLCs directly!)
   ```rust
   // Instruction for Alice
   nats_client.publish(
       "settlement.instruction.alice_peer_id",
       json!({
           "action": "create_zcash_htlc",
           "params": {
               "amount": 10000,
               "hash": hash,
               "recipient": bob_address,
               "timeout": 48
           }
       })
   ).await;
   ```

3. **Monitors blockchains** (read-only, no private keys needed)
   ```rust
   // Wait for Alice's HTLC on Zcash
   let zcash_htlc = monitor_zcash_blockchain(hash).await;

   // Wait for Bob's HTLC on Starknet
   let starknet_htlc = monitor_starknet_blockchain(hash).await;
   ```

4. **Tells Alice to claim** (provides secret)
   ```rust
   nats_client.publish(
       "settlement.instruction.alice_peer_id",
       json!({
           "action": "claim_usdc",
           "secret": secret, // NOW revealed!
           "htlc_address": starknet_htlc.address
       })
   ).await;
   ```

5. **Monitors secret reveal** on Starknet
   ```rust
   let revealed_secret = watch_claim_transaction(starknet_htlc).await;
   ```

6. **Tells Bob the secret is revealed** (Bob can now claim ZEC)
   ```rust
   nats_client.publish(
       "settlement.instruction.bob_peer_id",
       json!({
           "action": "claim_zec",
           "secret": revealed_secret, // Public now
           "htlc_address": zcash_htlc.address
       })
   ).await;
   ```

**What Settlement Service DOES NOT DO:**
- ❌ Hold any private keys
- ❌ Sign any transactions
- ❌ Create HTLCs directly
- ❌ Access user funds

**Communication Architecture:**
```
Settlement Service (Coordinator)
    ↓ (NATS: settlement.instruction.*)
Go Backend Nodes (Alice & Bob)
    ↓ (WebSocket)
Frontend (React)
    ↓ (Wallet API: window.ethereum, window.starknet)
User Wallets (ArgentX, Zcash Wallet)
    ↓ (User approves)
Blockchain (Zcash, Starknet)
    ↑ (Settlement Service monitors read-only)
Settlement Service (sees HTLCs, coordinates next step)
```

**Key coordination steps:**

| Step | Settlement Service Action | User Action |
|------|--------------------------|-------------|
| 1 | Generate secret & hash | - |
| 2 | Send instruction to Alice | - |
| 3 | - | Alice signs HTLC creation (Zcash) |
| 4 | Monitor Zcash, see HTLC created | - |
| 5 | Send instruction to Bob | - |
| 6 | - | Bob signs HTLC creation (Starknet) |
| 7 | Monitor Starknet, see HTLC created | - |
| 8 | Send claim instruction to Alice | - |
| 9 | - | Alice signs claim (Starknet) |
| 10 | Monitor Starknet, extract revealed secret | - |
| 11 | Send claim instruction to Bob | - |
| 12 | - | Bob signs claim (Zcash) |
| 13 | Monitor Zcash, confirm claim | - |
| 14 | Publish "swap complete" status | - |

**Summary:** Settlement Service is like a **conductor** - it tells everyone when to play, but doesn't play the instruments itself. Users hold all the keys (literally).

---

### Q4: What if one party doesn't claim?

**A:** **Automatic refund** after timeout:
- Bob gets USDC back (24 hours)
- Alice gets ZEC back (48 hours)

The refund is built into the HTLC smart contract - no coordination needed.

---

### Q5: Can we run settlement service without blockchain for now?

**A:** Yes! Start with **Mock Mode** (Option 3):

```rust
pub struct MockHTLCManager {
    htlcs: HashMap<String, MockHTLC>,
}

impl MockHTLCManager {
    async fn create_htlc(&mut self, params: HTLCParams) -> String {
        // Don't create real HTLC, just log it
        info!("✅ Mock HTLC created on {}", params.chain);

        // Store in memory
        let id = generate_id();
        self.htlcs.insert(id.clone(), MockHTLC { params });
        id
    }
}
```

This lets you test the **coordination flow** without real blockchain. Then upgrade to Backend Wallets (testnet) → Full Wallet Integration (mainnet).

---

## Next Steps (Recommended Order)

1. **Immediate (Demo Mode):**
   - Create mock HTLC implementation
   - Log settlement steps
   - Show "Settlement in progress" in frontend

2. **Short-term (Testnet):**
   - Integrate Zcash testnet client
   - Deploy Starknet testnet HTLC contract
   - Test full flow with test tokens

3. **Long-term (Production):**
   - Audit contracts
   - Mainnet deployment
   - Add settlement monitoring UI
   - Integrate with real wallets

---

## Resources

### Zcash
- [Zcash RPC Documentation](https://zcash.readthedocs.io/)
- [Orchard Book](https://zcash.github.io/orchard/)
- [Transparent Pool HTLCs](https://github.com/zcash/zcash/blob/master/src/script/)

### Starknet
- [Starknet Rust SDK](https://github.com/xJonathanLEI/starknet-rs)
- [Cairo HTLC Example](https://github.com/starknet-edu/starknet-cairo-101)
- [Sepolia Testnet](https://sepolia.voyager.online/)

### HTLCs
- [HTLC Explained](https://en.bitcoin.it/wiki/Hash_Time_Locked_Contracts)
- [Atomic Swaps](https://bitcoinwiki.org/wiki/atomic-swap)
- [Lightning Network HTLCs](https://lightning.network/lightning-network-paper.pdf)
