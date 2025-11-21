# Settlement Implementation Guide

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

### Q: Who initiates the settlement?
**A:** The **Go backend (Alice's node)** automatically initiates when Alice accepts a proposal. It publishes to NATS, and the Settlement Service (Rust) picks it up.

### Q: Does Alice or Bob need to do anything?
**A:** Currently, **Alice accepts the proposal** (manual). After that, settlement is **fully automated**:
- Settlement Service creates HTLCs
- Alice's wallet auto-claims USDC (or manual with wallet integration)
- Bob's wallet auto-claims ZEC (by watching Alice's claim)

### Q: What if one party doesn't claim?
**A:** **Automatic refund** after timeout:
- Bob gets USDC back (24 hours)
- Alice gets ZEC back (48 hours)

### Q: Can we run settlement service without blockchain for now?
**A:** Yes! Create a mock implementation:
```rust
pub struct MockHTLCManager {
    // Simulate HTLC creation and claims
    // Log transactions without real blockchain
    // Test the flow end-to-end
}
```

Then swap for real implementation later.

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
