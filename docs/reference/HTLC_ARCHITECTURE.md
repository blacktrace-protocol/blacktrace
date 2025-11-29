# HTLC Architecture for BlackTrace Settlement

**Last Updated:** 2025-11-22

## Table of Contents
- [Overview](#overview)
- [MVP Approach (Demo)](#mvp-approach-demo)
- [Production Approach](#production-approach)
- [HTLC Technical Details](#htlc-technical-details)
- [Message Flow](#message-flow)
- [State Transitions](#state-transitions)
- [Security Considerations](#security-considerations)

---

## Overview

BlackTrace uses **Hash Time-Locked Contracts (HTLCs)** to enable trustless atomic swaps between Zcash (ZEC) and stablecoins on Starknet. The settlement service coordinates the swap without ever holding user funds.

### Key Principles
1. **Atomic**: Either both parties receive funds, or neither does
2. **Trustless**: No need to trust counterparty or settlement service
3. **Time-bound**: Automatic refund if swap doesn't complete
4. **Secret-based**: Cryptographic proof links both transactions

---

## MVP Approach (Demo)

**Goal:** Prove the atomic swap logic works without complex wallet integration.

### Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Alice     │         │   Backend    │         │ Settlement  │
│  (Frontend) │         │  (Go Node)   │         │ Service(Rust)│
└─────────────┘         └──────────────┘         └─────────────┘
      │                        │                        │
      │ 1. Click "Lock ZEC"    │                        │
      ├───────────────────────>│                        │
      │                        │ 2. POST /lock-zec      │
      │                        │    status=alice_locked │
      │                        │                        │
      │                        │ 3. NATS: settlement.status.{proposal_id}
      │                        ├───────────────────────>│
      │                        │    {action: alice_lock_zec}
      │                        │                        │
      │                        │                        │ 4. Generate secret S
      │                        │                        │    hash H = hash(S)
      │                        │                        │
      │                        │                        │ 5. Create HTLC script
      │                        │                        │    (Alice refund OR Bob claim)
      │                        │                        │
      │                        │                        │ 6. Build Zcash tx
      │                        │                        │    Send ZEC to P2SH(HTLC)
      │                        │                        │
      │                        │                        │ 7. Sign & broadcast tx
      │                        │                        │    (Service has testnet keys)
      │                        │                        │
      │                        │ 8. NATS: settlement.zec_locked
      │                        │<───────────────────────┤
      │                        │    {txid, htlc_hash: H}
      │                        │                        │
      │ 9. Show "ZEC Locked"   │                        │
      │<───────────────────────┤                        │
      │    (via polling)       │                        │
```

### Key Characteristics

**Pros:**
- ✅ Fast to implement
- ✅ Proves atomic swap logic works
- ✅ No wallet integration complexity
- ✅ Easy to test and debug
- ✅ Can use testnet faucets

**Cons:**
- ❌ Settlement service holds private keys (centralized)
- ❌ Not production-ready
- ❌ Users don't control their funds
- ❌ Demo only - not secure for real value

### Implementation Details

**Settlement Service Responsibilities:**
1. **Subscribe to NATS:** `settlement.status.*`
2. **Generate secrets:** Create cryptographically secure random preimage
3. **Build HTLCs:** Create P2SH scripts for Zcash, deploy contracts on Starknet
4. **Sign transactions:** Use testnet private keys (stored in service config)
5. **Monitor chains:** Watch for confirmations on both chains
6. **Reveal secret:** Share secret with Bob after both sides locked
7. **Coordinate claims:** Help both parties claim their funds

**Private Key Management (MVP):**
```toml
# settlement-service/config.toml
[testnet]
alice_zcash_privkey = "cPrivKey..."  # Zcash testnet
bob_zcash_privkey = "cPrivKey..."    # Zcash testnet
alice_starknet_privkey = "0x..."     # Starknet testnet
bob_starknet_privkey = "0x..."       # Starknet testnet
```

**Frontend UX:**
- Shows "Sign with Zcash Wallet" popup (mock)
- Displays transaction details
- Backend actually executes the transaction
- User sees the result as if they signed it

---

## Production Approach

**Goal:** Users control their own private keys; settlement service only coordinates.

### Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Alice     │         │   Backend    │         │ Settlement  │
│  (Frontend) │         │  (Go Node)   │         │ Service(Rust)│
│             │         │              │         │             │
│ ┌─────────┐ │         │              │         │             │
│ │ Zcash   │ │         │              │         │             │
│ │ Wallet  │ │         │              │         │             │
│ └─────────┘ │         │              │         │             │
└─────────────┘         └──────────────┘         └─────────────┘
      │                        │                        │
      │ 1. Click "Lock ZEC"    │                        │
      ├───────────────────────>│                        │
      │                        │ 2. POST /lock-zec      │
      │                        ├───────────────────────>│
      │                        │                        │
      │                        │                        │ 3. Generate secret S
      │                        │                        │    hash H = hash(S)
      │                        │                        │
      │                        │                        │ 4. Create HTLC script
      │                        │                        │    (Alice refund OR Bob claim)
      │                        │                        │
      │                        │ 5. Return unsigned tx  │
      │                        │<───────────────────────┤
      │                        │    {unsigned_tx, htlc_hash: H}
      │                        │                        │
      │ 6. Receive unsigned tx │                        │
      │<───────────────────────┤                        │
      │                        │                        │
      │ 7. Show in wallet UI   │                        │
      │    (popup/extension)   │                        │
      │                        │                        │
      │ 8. User reviews & signs│                        │
      │    with REAL private key                        │
      │    (NEVER leaves wallet)                        │
      │                        │                        │
      │ 9. Broadcast signed tx │                        │
      ├───────────────────────>│                        │
      │                        │ 10. NATS: tx broadcast │
      │                        ├───────────────────────>│
      │                        │                        │
      │                        │                        │ 11. Monitor chain
      │                        │                        │     Wait for confirmations
      │                        │                        │
      │                        │ 12. NATS: zec_locked   │
      │                        │<───────────────────────┤
      │                        │     {txid, confirmations}
```

### Key Characteristics

**Pros:**
- ✅ Users control their private keys
- ✅ Non-custodial (trustless)
- ✅ Production-ready security model
- ✅ Settlement service never sees private keys
- ✅ Follows web3 best practices

**Cons:**
- ❌ Complex wallet integration
- ❌ Requires wallet support for custom scripts
- ❌ Different UX for desktop vs mobile
- ❌ Longer development time

### Wallet Integration Options

#### **Desktop (Browser Extension)**

**Option A: Direct Extension Integration**
```javascript
// Frontend calls wallet extension
const zcashWallet = await window.zcash.connect();
const signed = await zcashWallet.signTransaction(unsignedTx);
await zcashWallet.broadcast(signed);
```

**Wallets that might support this:**
- Custom browser extension (build your own)
- Existing extensions with script support (if available)

#### **Mobile**

**Option B: Deep Linking**
```javascript
// Frontend generates deep link
const deepLink = `zcash://sign?tx=${unsignedTxHex}&callback=${callbackUrl}`;
window.location = deepLink;
// Mobile wallet signs and calls callback
```

**Option C: WalletConnect-Style**
```javascript
// QR code with unsigned transaction
const qrData = {
  unsignedTx: txHex,
  htlcScript: scriptHex,
  callback: 'https://blacktrace.app/settlement/callback'
};
// Mobile wallet scans, signs, broadcasts, calls callback
```

**Option D: Dedicated Mobile App**
- Build native iOS/Android app
- Embedded wallet with HTLC support
- Best UX but most development effort

### Settlement Service Responsibilities (Production)

1. **Generate secrets** (same as MVP)
2. **Build unsigned transactions** (no private keys)
3. **Return transaction hex to frontend**
4. **Monitor blockchain** for transaction confirmation
5. **Reveal secret** after both sides locked
6. **Publish claim instructions** (unsigned claim txs)

**No private keys stored** ✅

---

## HTLC Technical Details

### Zcash HTLC Script

Zcash uses **Bitcoin Script** in **P2SH (Pay-to-Script-Hash)** addresses.

#### Script Structure

```
OP_IF
    # Bob's claim path (with secret)
    OP_HASH160
    <hash160(secret)>
    OP_EQUALVERIFY
    <Bob's pubkey>
    OP_CHECKSIG
OP_ELSE
    # Alice's refund path (after timeout)
    <timelock>
    OP_CHECKLOCKTIMEVERIFY
    OP_DROP
    <Alice's pubkey>
    OP_CHECKSIG
OP_ENDIF
```

#### Parameters

- **Hash H**: `RIPEMD160(SHA256(secret))`
- **Timelock T**: Block height or Unix timestamp (e.g., 144 blocks = ~24 hours)
- **Alice's pubkey**: 33-byte compressed pubkey
- **Bob's pubkey**: 33-byte compressed pubkey

#### Transaction Flow

**1. Alice Creates HTLC (Lock ZEC)**
```
Input: Alice's UTXO (normal address)
Output: P2SH address (HTLC script)
Amount: X ZEC
Fee: ~0.0001 ZEC
```

**2. Bob Claims ZEC (Reveals Secret)**
```
Input: P2SH UTXO (HTLC script)
ScriptSig: <Bob's signature> <secret> <1> <HTLC script>
Output: Bob's address
Amount: X ZEC - fee
Fee: ~0.0001 ZEC
```

**3. Alice Refunds (After Timeout)**
```
Input: P2SH UTXO (HTLC script)
ScriptSig: <Alice's signature> <0> <HTLC script>
Output: Alice's refund address
Amount: X ZEC - fee
Fee: ~0.0001 ZEC
Timelock: Must be >= T
```

### Starknet HTLC Contract

Starknet uses **Cairo smart contracts**.

#### Contract Interface

```cairo
#[starknet::interface]
trait IHTLCContract<TContractState> {
    fn create_htlc(
        ref self: TContractState,
        hash: felt252,
        recipient: ContractAddress,
        timelock: u64,
        amount: u256
    ) -> felt252;  // Returns HTLC ID

    fn claim(
        ref self: TContractState,
        htlc_id: felt252,
        secret: felt252
    );

    fn refund(
        ref self: TContractState,
        htlc_id: felt252
    );
}
```

#### State Structure

```cairo
struct HTLC {
    sender: ContractAddress,      // Alice
    recipient: ContractAddress,   // Bob
    hash: felt252,                 // H = hash(secret)
    amount: u256,                  // USDC amount
    timelock: u64,                 // Expiry timestamp
    claimed: bool,                 // Has Bob claimed?
    refunded: bool,                // Has Alice refunded?
}
```

#### Transaction Flow

**1. Alice Creates HTLC (Lock USDC)**
```cairo
// Actually Bob creates this after seeing Alice lock ZEC
bob.create_htlc(
    hash: H,                    // Same hash as Zcash HTLC
    recipient: alice_address,   // Alice receives USDC
    timelock: now + 12 hours,   // Half of Zcash timeout
    amount: X USDC
);
```

**2. Alice Claims USDC (Reveals Secret)**
```cairo
alice.claim(
    htlc_id: htlc_id,
    secret: S                   // Reveals secret on-chain
);
// Anyone can now see S and use it to claim Zcash
```

**3. Bob Refunds (After Timeout)**
```cairo
// Only if Alice never claimed
bob.refund(htlc_id);
```

### Secret Generation

**Requirements:**
- Cryptographically secure random number
- 256 bits (32 bytes)
- Unpredictable

**Implementation (Rust):**
```rust
use rand::rngs::OsRng;
use sha2::{Sha256, Digest};
use ripemd::{Ripemd160};

// Generate secret
let mut secret = [0u8; 32];
OsRng.fill_bytes(&mut secret);

// Generate hash for Zcash (hash160)
let sha_hash = Sha256::digest(&secret);
let hash160 = Ripemd160::digest(&sha_hash);

// Generate hash for Starknet (felt252)
let starknet_hash = poseidon_hash(&secret);
```

---

## Message Flow

### NATS Topics

**Settlement Requests:** `settlement.request.{proposal_id}`
```json
{
  "proposal_id": "order_123_proposal_456",
  "order_id": "order_123",
  "maker_id": "Qm...",
  "taker_id": "Qm...",
  "amount": 100,
  "price": 50,
  "stablecoin": "USDC",
  "settlement_chain": "starknet",
  "timestamp": "2025-11-22T..."
}
```

**Settlement Status Updates:** `settlement.status.{proposal_id}`
```json
{
  "proposal_id": "order_123_proposal_456",
  "order_id": "order_123",
  "settlement_status": "alice_locked",
  "action": "alice_lock_zec",
  "amount": 100,
  "timestamp": "2025-11-22T..."
}
```

**Settlement Instructions:** `settlement.instructions.{proposal_id}`
```json
{
  "proposal_id": "order_123_proposal_456",
  "instruction_type": "create_zec_htlc",
  "htlc_hash": "a1b2c3...",
  "timelock": 720,
  "alice_pubkey": "02...",
  "bob_pubkey": "03...",
  "amount_zec": 100,
  "p2sh_address": "t3...",
  "unsigned_tx": "0100000...",  // Production only
  "signed_tx": "0100000..."     // MVP only
}
```

**Chain Events:** `settlement.chain.{chain}.{proposal_id}`
```json
{
  "proposal_id": "order_123_proposal_456",
  "chain": "zcash",
  "event": "htlc_created",
  "txid": "abc123...",
  "confirmations": 6,
  "block_height": 2500000
}
```

---

## State Transitions

### Settlement State Machine

```
                    ┌──────────────┐
                    │   ACCEPTED   │
                    │ (status=ready)│
                    └───────┬──────┘
                            │
          Alice clicks      │
          "Lock ZEC"        │
                            ▼
                    ┌──────────────┐
                    │ ALICE_LOCKED │
                    │ ZEC in HTLC  │
                    └───────┬──────┘
                            │
          Bob clicks        │
          "Lock USDC"       │
                            ▼
                    ┌──────────────┐
                    │ BOTH_LOCKED  │
                    │ Atomic swap  │
                    │   enabled    │
                    └───────┬──────┘
                            │
          Settlement svc    │
          reveals secret    │
                            ▼
                    ┌──────────────┐
                    │  CLAIMING    │
                    │ Both parties │
                    │ can claim    │
                    └───────┬──────┘
                            │
          Both claimed      │
                            ▼
                    ┌──────────────┐
                    │   COMPLETE   │
                    │ Swap success │
                    └──────────────┘
```

### Timeout Scenarios

**Scenario 1: Alice locks, Bob doesn't lock**
```
ready → alice_locked → (timeout) → Alice refunds ZEC
```

**Scenario 2: Both lock, but claims timeout**
```
both_locked → (timeout on Starknet) → Bob refunds USDC
            → (timeout on Zcash) → Alice refunds ZEC
```

**Scenario 3: Happy path**
```
both_locked → claiming → complete
```

### Timelock Values

**Zcash HTLC:** 24 hours (144 blocks)
- Alice can refund after 24 hours if swap fails

**Starknet HTLC:** 12 hours
- Bob can refund after 12 hours if Alice doesn't claim
- Shorter than Zcash to ensure Bob can't claim both

**Why this works:**
1. Both lock funds
2. Alice claims USDC (reveals secret) within 12 hours
3. Bob sees secret on Starknet, claims ZEC within 24 hours
4. If Alice doesn't claim within 12 hours, Bob refunds USDC
5. If Bob doesn't claim within 24 hours, Alice refunds ZEC

---

## Security Considerations

### Atomic Swap Guarantees

**Atomicity:** Either both succeed or both fail
- ✅ Cryptographically guaranteed by hash lock
- ✅ Time locks ensure refunds

**Fairness:**
- ✅ Secret revelation is one-way (blockchain is public)
- ✅ First claimer reveals secret for second claimer
- ✅ No party can cheat

### Attack Vectors & Mitigations

**Attack 1: Alice claims USDC but Bob can't claim ZEC**
- **Mitigation:** Secret is revealed on-chain when Alice claims
- **Result:** Bob can always claim if Alice claimed

**Attack 2: Bob front-runs Alice's claim**
- **Mitigation:** Doesn't matter - both parties get their funds
- **Result:** Swap still succeeds

**Attack 3: Network congestion prevents claim**
- **Mitigation:** Generous timelocks (12-24 hours)
- **Result:** Plenty of time to claim even with congestion

**Attack 4: Settlement service disappears**
- **MVP:** Users lose funds (centralized)
- **Production:** Users can still claim/refund (decentralized)

**Attack 5: Settlement service gives wrong hash**
- **Mitigation:** Both chains use same hash (verifiable)
- **Result:** Swap won't complete, both parties refund

### Key Management

**MVP:**
- ⚠️ Settlement service holds private keys
- ⚠️ Use testnet only
- ⚠️ Rotate keys regularly
- ⚠️ Encrypt keys at rest

**Production:**
- ✅ Users control private keys
- ✅ Settlement service only coordinates
- ✅ Non-custodial design
- ✅ Zero trust architecture

---

## Implementation Phases

### **Phase 1: Settlement Service Core** (Current)
- [x] NATS subscription
- [ ] Secret generation
- [ ] State machine
- [ ] HTLC script building (Zcash)
- [ ] HTLC contract interaction (Starknet)
- [ ] Chain monitoring
- [ ] MVP: Sign & broadcast transactions

### **Phase 2: MVP Demo** (Next)
- [ ] Testnet integration
- [ ] End-to-end atomic swap test
- [ ] Frontend shows transaction details
- [ ] Documentation & demo video

### **Phase 3: Production Hardening** (Future)
- [ ] Remove private keys from service
- [ ] Unsigned transaction generation
- [ ] Wallet integration (desktop)
- [ ] Wallet integration (mobile)
- [ ] Mainnet deployment
- [ ] Security audit

---

## References

- [Bitcoin HTLC Script](https://en.bitcoin.it/wiki/Hash_Time_Locked_Contracts)
- [Zcash P2SH Documentation](https://zcash.readthedocs.io/en/latest/)
- [Starknet Cairo Contracts](https://book.starknet.io/)
- [Atomic Swap Security](https://arxiv.org/abs/1801.09515)

---

**Next Steps:** Implement settlement service with MVP approach (testnet keys, automatic signing).
