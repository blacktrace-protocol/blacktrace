# BlackTrace Key Workflows

## Overview

BlackTrace implements ZEC ↔ STRK atomic swaps with three workflows: **Orders**, **Proposals**, and **Settlement**.

---

## 1. Order Workflow

**Purpose**: Alice creates an order to sell ZEC.

### Flow
1. Alice creates order with amount, min/max price
2. Order signed with ECDSA-SHA256
3. Broadcast via libp2p GossipSub to all peers
4. Optional: Order details ECIES-encrypted for specific taker

### Encryption
- **Algorithm**: ECIES with P-256 curve
- **Symmetric**: AES-256-GCM
- **KDF**: HKDF-SHA256

### Key Files
- `services/node/types.go:57-77` - Order structures
- `services/node/crypto.go:103-168` - ECIES encryption
- `services/node/app.go:467-544` - Order creation

---

## 2. Proposal Workflow

**Purpose**: Bob responds to Alice's order with a price proposal.

### Flow
1. Bob sees order announcement
2. Bob creates proposal with price and pubkey_hash
3. Proposal ECIES-encrypted to Alice only (prevents frontrunning)
4. Alice accepts/rejects
5. Acceptance ECIES-encrypted to Bob (prevents value leakage)
6. Settlement request published to NATS

### Status States
```
Proposal: Pending → Accepted/Rejected
Settlement: ready → alice_locked → bob_locked → both_locked → complete
```

### Key Files
- `services/node/types.go:98-110` - Proposal structure
- `services/node/app.go:846-888` - Proposal creation
- `services/node/app.go:957-1022` - Proposal acceptance

---

## 3. Settlement Workflow

**Purpose**: Execute atomic swap via HTLC.

### Secret & Hash
```
secret (32 bytes) → SHA256 → RIPEMD160 → hash_lock (20 bytes)
```

### HTLC Script Structure
```
OP_IF                           // Claim path (Bob)
    OP_SHA256 OP_RIPEMD160
    <hash_lock> OP_EQUALVERIFY
    OP_DUP OP_HASH160 <bob_pubkey_hash>
OP_ELSE                         // Refund path (Alice, after timeout)
    <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP
    OP_DUP OP_HASH160 <alice_pubkey_hash>
OP_ENDIF
OP_EQUALVERIFY OP_CHECKSIG
```

### Settlement Flow

| Step | Actor | Action |
|------|-------|--------|
| 1 | Alice | Accept proposal, publish secret to NATS |
| 2 | Settlement | Build HTLC script, create P2SH address |
| 3 | Alice | Lock ZEC to HTLC P2SH address |
| 4 | Bob | Lock USDC on Starknet (same hash_lock) |
| 5 | Alice | Claim STRK on Starknet (reveals secret) |
| 6 | Bob | See secret, claim ZEC from HTLC |

### Bob's Claim Transaction

**ScriptSig Construction** (`transaction.go:476-508`):
```
[signature] [pubkey] [secret] [OP_TRUE] [redeemScript]
```

**SigHash Computation** (`transaction.go:510-553`):
- Serialize: version + inputs + redeemScript + outputs + locktime + SIGHASH_ALL
- Double SHA256

**Signature**: ECDSA secp256k1, DER encoded + SIGHASH_ALL byte

### Key Files
- `connectors/zcash/htlc.go:48-97` - HTLC script construction
- `connectors/zcash/transaction.go:239-397` - Claim transaction
- `services/settlement/main.go:370-449` - Lock ZEC flow

---

## Security Summary

| Property | Mechanism |
|----------|-----------|
| Atomicity | HTLC with hash locks |
| Message Integrity | ECDSA signatures |
| Confidentiality | ECIES encryption |
| Frontrunning Prevention | Encrypted proposals |
| Timeout Safety | OP_CHECKLOCKTIMEVERIFY |
