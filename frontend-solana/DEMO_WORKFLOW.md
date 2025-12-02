# BlackTrace Demo Workflow

## The Story

Alice holds 5 ZEC on Zcash and wants to acquire 500 STRK on Starknet. Bob holds 500 STRK on Starknet and wants to acquire 5 ZEC on Zcash.

Instead of using a centralized exchange (which would expose their trading intentions and require trust) or a DEX (which only operates within a single chain), they use BlackTrace to execute a trustless, private atomic swap. Neither party needs to trust the other, and their trading intentions remain confidential through end-to-end encryption.

---

## Step-by-Step Process

### 1. Private Negotiation

Alice creates a sell order for 5 ZEC. The order is broadcast over BlackTrace's encrypted P2P network, protected by two layers of encryption: Noise protocol at the transport layer and ECIES (Elliptic Curve Integrated Encryption Scheme) at the application layer. Bob discovers the order and sends an encrypted proposal. All negotiation messages are end-to-end encrypted, preventing orderflow leakage and front-running attacks.

### 2. Settlement Initialization

Once Alice accepts Bob's proposal, the settlement service generates a random 32-byte cryptographic secret and computes its hash. This hash is shared with both parties while the secret remains private until the claim phase.

### 3. Lock Phase - Zcash (Alice)

Alice creates a secret phrase and locks her 5 ZEC in a Zcash HTLC (Hash Time-Locked Contract). The HTLC is programmed so that anyone with the secret can claim the funds before the timeout, or Alice can refund after the timeout expires.

### 4. Lock Phase - Starknet (Bob)

Bob sees Alice's ZEC lock confirmed on Zcash. Using the same hash from Alice's HTLC, Bob locks his 500 STRK in a Starknet HTLC contract. Both assets are now secured with matching hash locks.

### 5. Claim Phase - Alice Claims STRK

Alice reveals her secret on the Starknet blockchain to claim Bob's STRK. This transaction is public—the secret is now visible on-chain for anyone to see, including Bob.

### 6. Claim Phase - Bob Claims ZEC

Bob monitors Starknet and sees Alice's claim transaction revealing the secret. He uses this same secret to claim Alice's ZEC from the Zcash HTLC. The atomic swap is complete.

### 7. Completion

Alice now holds 500 STRK on Starknet. Bob now holds 5 ZEC on Zcash. The swap completed trustlessly—neither party could cheat because both HTLCs used the same hash lock, and their trading intentions remained private throughout the negotiation phase.

---

## Security Properties

### Encryption Layers

| Layer | Technology | Purpose |
|-------|------------|---------|
| Transport | Noise Protocol (libp2p) | Encrypts all P2P connections |
| Application | ECIES (AES-256-GCM + ECDH) | End-to-end message encryption |
| Authentication | ECDSA Signatures | Message integrity and sender verification |

### MEV Protection

The dual-layer encryption provides protection against off-chain orderflow extraction:

- **Order details are encrypted** — Only the intended counterparty can see trade details
- **Proposals are encrypted with maker's public key** — Prevents front-running by P2P network observers
- **Acceptances are encrypted** — Prevents value extraction from knowing which proposals get accepted

### Atomic Swap Guarantees

- **Trustless** — Neither party can cheat; either both receive funds or both get refunded
- **Timelock protection** — If either party fails to act, the other can reclaim their funds after timeout
- **Hash lock binding** — Both HTLCs use the same hash, ensuring atomicity across chains

---

## Demo Limitations

> **Note**: The current implementation demonstrates the complete flow up to the locking phase. The final claim step requires upgrading to Cairo 2.7+ to enable SHA256 hash compatibility between Zcash and Starknet chains.

### Current Status

| Step | Status |
|------|--------|
| Order creation & P2P negotiation | Working |
| Alice locks ZEC in Zcash HTLC | Working |
| Bob locks STRK in Starknet HTLC | Working |
| Alice claims STRK (reveals secret) | Blocked (hash mismatch) |
| Bob claims ZEC | Blocked (depends on step above) |

### Technical Details

- **Zcash HTLC** uses `RIPEMD160(SHA256(secret))` for hash verification
- **Starknet HTLC** currently uses `Pedersen(secret, 0)` for hash verification
- **Solution**: Upgrade to Cairo 2.7+ which provides `sha256_process_block_syscall`, allowing both chains to use SHA256

See `/connectors/starknet/htlc-contract/DEPLOYMENT.md` for detailed upgrade instructions.
