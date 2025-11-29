# BlackTrace Demo Script

## Opening (30 seconds)

> "Imagine you want to buy $500,000 worth of crypto. You could use a centralized exchange—but then you're trusting them with your funds, your identity, and hoping they don't get hacked or freeze your account.
>
> Or you could trade peer-to-peer. But how do you trust a stranger on the internet with half a million dollars?
>
> **BlackTrace solves this.** It's infrastructure for high-value crypto trades that are trustless, private, and atomic—meaning either both parties get what they agreed to, or neither does. No middleman. No counterparty risk."

---

## The Problem (45 seconds)

> "Let's break down why this matters.
>
> **Centralized exchanges** require KYC, can freeze your funds, get hacked, or go bankrupt—ask anyone who had money on FTX.
>
> **Traditional OTC desks** require you to trust a broker, often with large minimums and fees.
>
> **Simple P2P trades** are risky—if I send you Bitcoin first, what stops you from disappearing with my money?
>
> BlackTrace eliminates these problems using **Hash Time-Locked Contracts**—or HTLCs. It's the same cryptographic primitive that powers Bitcoin's Lightning Network, but we use it for cross-chain settlement."

---

## How It Works - The Concept (1 minute)

> "Here's the core idea:
>
> **Alice** wants to sell 1 ZEC (Zcash) for $120 in stablecoins.
> **Bob** wants to buy that ZEC.
>
> Instead of trusting each other, they use a **cryptographic lock**:
>
> 1. Alice creates a **secret** (just a random number) and publishes its **hash** (a fingerprint of that secret)
> 2. Alice locks her ZEC in a smart contract that says: *'Bob can claim this ZEC if he knows the secret'*
> 3. Bob sees the hash, and locks his $120 USDC in another contract that says: *'Alice can claim this USDC if she reveals the secret'*
> 4. Now here's the magic: **Alice reveals the secret to claim Bob's USDC**
> 5. Once she does, **Bob can see the secret on-chain and use it to claim the ZEC**
>
> If anything goes wrong—if Bob never locks his USDC, or if Alice disappears—the contracts have **timeouts** that automatically refund each party.
>
> **This is atomic**: either the full swap happens, or nothing happens. No one can cheat."

---

## Quick Terminology (20 seconds)

> "Quick definitions:
>
> - **Maker** = the person who creates the trade offer (Alice, selling ZEC)
> - **Taker** = the person who accepts the offer (Bob, buying ZEC)
> - **HTLC** = Hash Time-Locked Contract, the cryptographic lock that makes this trustless
>
> And about the assets—we're demoing ZEC to STRK, but the same flow works for **any token pair**. Want to buy ETH with USDC? Same process. The stablecoin side is essentially 'cash' on the blockchain."

---

## Why Multiple Steps? (30 seconds)

> "You might wonder—why so many steps for a simple swap?
>
> For a $50 trade, you'd just use Uniswap. But this isn't for $50 trades.
>
> **BlackTrace is for high-value OTC trades**—think hundreds of thousands or millions of dollars moving between two different blockchain networks.
>
> At that scale, you want:
> - **Verification at every step** (did the funds actually lock?)
> - **Ability to abort safely** (timeouts if something goes wrong)
> - **Privacy** (encrypted order details, no public order book)
> - **No counterparty risk** (cryptographic guarantees, not trust)
>
> Each step exists because when you're moving serious money, you don't skip safety checks."

---

## The Demo Flow (2-3 minutes)

### Setup
> "We have two users: **Alice** (the maker, selling ZEC) and **Bob** (the taker, buying ZEC with stablecoins).
>
> They don't know each other. They're connected through a peer-to-peer network—no central server."

### Step 1: Alice Creates an Order
> "Alice posts an order: 'I want to sell 1 ZEC for between $100-$150.'
>
> This broadcasts to the P2P network. Anyone can see there's an order, but the **price details are encrypted**—only serious counterparties who request details can see them.
>
> Why encrypt? To prevent front-running and information leakage. In traditional markets, visible order books get exploited."

### Step 2: Bob Sees the Order and Proposes
> "Bob sees Alice's order and proposes: 'I'll buy 1 ZEC at $120.'
>
> His proposal is **encrypted specifically for Alice**—other traders can't see Bob's price and undercut him.
>
> This is like a sealed-bid auction, but cryptographically enforced."

### Step 3: Alice Accepts
> "Alice reviews Bob's proposal and accepts. At this point, she provides a **secret**—a random value that will be used to lock the contracts.
>
> The settlement process now begins."

### Step 4: Alice Locks ZEC
> "Alice locks her 1 ZEC into an HTLC on the Zcash blockchain. The contract says:
> - Bob can claim if he provides the secret
> - Alice can refund after 24 hours if Bob disappears
>
> *[Show the transaction confirming]*
>
> The ZEC is now locked. Alice can't take it back (unless timeout), and Bob can't access it yet (needs secret)."

### Step 5: Bob Locks USDC
> "Bob sees Alice's ZEC is locked. He now locks $120 USDC on Starknet with the **same hash**.
>
> His contract says:
> - Alice can claim if she reveals the secret
> - Bob can refund after 12 hours (shorter than Alice's timeout—this is important for safety)
>
> *[Show the lock confirmation]*
>
> Now **both assets are locked**. The swap is ready to complete."

### Step 6: Alice Claims USDC (Reveals Secret)
> "Alice claims her $120 USDC by submitting the secret to the Starknet contract.
>
> *[Show the claim transaction]*
>
> Here's the key insight: **by claiming, Alice reveals the secret on-chain**. It's now public."

### Step 7: Bob Claims ZEC
> "Bob sees Alice's claim transaction on Starknet, extracts the secret, and uses it to claim the ZEC on Zcash.
>
> *[Show the successful claim]*
>
> **Done.** Alice has her $120 USDC. Bob has his 1 ZEC. No trust required."

---

## What Just Happened (30 seconds)

> "Let's recap what made this trustless:
>
> 1. **Cryptographic locks** instead of trust—the secret is the key
> 2. **Atomic execution**—both get paid or both get refunded
> 3. **Timeout safety**—if anyone disappears, funds return automatically
> 4. **Privacy**—encrypted orders and proposals, no public order book
> 5. **Cross-chain**—ZEC on one network, USDC on another, no bridge required
>
> This is the infrastructure for the next generation of OTC trading."

---

## Closing (20 seconds)

> "BlackTrace is building trustless settlement infrastructure for high-value crypto trades.
>
> Whether you're a trading desk moving millions, a DAO treasury diversifying holdings, or an individual making a large purchase—you shouldn't have to trust a counterparty or intermediary.
>
> Learn more at **blacktrace.xyz**"

---

## FAQ Responses (if asked)

### "Why ZEC and STRK specifically?"
> "This is just a demo configuration. The protocol works with any assets that support hash locks—Bitcoin, Ethereum, Solana, Starknet, and more. ZEC and STRK show it working across two very different chains."

### "What if I want to buy tokens with actual cash?"
> "On blockchain networks, stablecoins like USDC and USDT *are* cash. Buying tokens with USDC is functionally identical to buying with dollars. The stablecoin is just how fiat value is represented on-chain."

### "Why does Alice encrypt the order? How does she know Bob?"
> "Alice doesn't know Bob—that's the point. The order is broadcast to everyone on the P2P network. Encryption serves two purposes:
> 1. Price details are only revealed to serious counterparties who request them
> 2. Proposals are encrypted to prevent front-running (no one can see Bob's price and undercut him)
>
> It's privacy by default, not because they know each other."

### "Isn't this complicated?"
> "For a $100 trade, yes—use an AMM. But for $100,000+? These steps are features, not bugs. Each checkpoint lets you verify before proceeding. The complexity protects your capital."
