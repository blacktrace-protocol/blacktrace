# BlackTrace Demo Script

## Opening - The Hook (20 seconds)

> "Bridges get hacked. You know the names—Wormhole, Ronin, Nomad. Over $2 billion lost.
>
> Why? Because bridges hold your assets while they move. That's the risk.
>
> **BlackTrace is cross-chain settlement without the bridge.** Your assets stay in your control, locked by a cryptographic key. You get paid or you get refunded. That's it."

---

## How It Works - The Concept (45 seconds)

> "Here's how it works:
>
> **Alice** wants to sell 1 ZEC. **Bob** wants to buy it with stablecoins.
>
> Instead of trusting a bridge—or each other—they use a **hash-locked escrow**:
>
> 1. Alice locks her ZEC on Zcash with a secret key
> 2. Bob locks his USDC on Starknet with the *same* key
> 3. Alice claims the USDC by revealing the secret
> 4. Bob sees the secret and claims the ZEC
>
> **Both get paid, or both get refunded.** No bridge. No custody. No trust."

---

## Why Not Just Use a Bridge? (30 seconds)

> "Bridges require someone to hold your assets while they move across chains. That custodian is an attack vector.
>
> BlackTrace is different:
> - Your assets **stay on their native chains** until you claim
> - Locked by **cryptographic escrow**, not a custodian
> - If anything fails, **timeouts refund automatically**
>
> It's the difference between handing someone your keys and using a lockbox only you control."

---

## Quick Terms (15 seconds)

> "Quick definitions:
> - **Maker** = creates the order (Alice, selling ZEC)
> - **Taker** = accepts the order (Bob, buying with USDC)
> - **HTLC** = Hash Time-Locked Contract, the cryptographic lockbox
>
> And stablecoins like USDC are just 'cash' on-chain—same as trading for dollars."

---

## The Demo (2 minutes)

### Step 1: Alice Creates Order
> "Alice posts: 'Selling 1 ZEC for $100-$150.'
>
> This goes to the P2P network. Price details are **encrypted**—no public order book to front-run."

### Step 2: Bob Proposes
> "Bob sees the order and proposes $120.
>
> His proposal is **encrypted to Alice only**. Other traders can't see his price and undercut him."

### Step 3: Alice Accepts
> "Alice accepts and provides a secret. Settlement begins."

### Step 4: Alice Locks ZEC
> "Alice locks 1 ZEC on Zcash. The contract says:
> - Bob can claim with the secret
> - Alice can refund after 24 hours
>
> *[Show transaction]*
>
> ZEC is locked. Alice can't take it back."

### Step 5: Bob Locks USDC
> "Bob sees Alice's lock and locks $120 USDC on Starknet.
>
> *[Show transaction]*
>
> **Both assets locked.** Swap is ready."

### Step 6: Alice Claims USDC
> "Alice claims USDC by revealing the secret on-chain.
>
> *[Show claim]*
>
> The secret is now public."

### Step 7: Bob Claims ZEC
> "Bob sees the secret, uses it to claim ZEC.
>
> *[Show claim]*
>
> **Done.** Alice has USDC. Bob has ZEC. No bridge. No trust."

---

## What Makes This Different (30 seconds)

> "Four things:
>
> 1. **No bridge risk** — Assets stay on native chains, locked by crypto not custody
> 2. **No liquidity pools** — Direct peer-to-peer, no LPs or solvers taking spread
> 3. **Private negotiation** — Encrypted orders and bids, no front-running
> 4. **Negotiated pricing** — OTC-style offers and bids, not fixed AMM rates
>
> This is for serious trades where you can't afford bridge risk or slippage."

---

## Closing (15 seconds)

> "BlackTrace: Cross-chain settlement without the bridge.
>
> Lock, swap, done.
>
> **blacktrace.xyz**"

---

## FAQ (if asked)

**"Why so many steps?"**
> "For $50, use Uniswap. For $500,000, you want verification at every step. Each checkpoint is a safety feature."

**"Why ZEC and STRK?"**
> "Just a demo. Works with any chain that supports hash locks—Bitcoin, Ethereum, Solana, etc."

**"Why encrypted orders?"**
> "Prevents front-running. No public order book means no one can see your price and exploit it."

**"What about fiat?"**
> "Stablecoins are fiat on-chain. USDC = dollars. Same thing."
