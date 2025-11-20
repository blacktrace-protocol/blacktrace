# BlackTrace - Hackathon Pitch

## One-Liner
**Trustless OTC trading for crypto whales who found each other on Discord and don't want to get rugged.**

## The Problem (30 seconds)

**Scenario**: You're a DAO treasury manager. You find a buyer for 50,000 ZEC ($23M) on Discord. You don't know them.

**What are your options?**
1. ❌ **Trust them**: Send ZEC first, hope they send USDC (lol, no)
2. ❌ **Use OTC desk**: They see your $23M order and front-run you on exchanges
3. ❌ **Escrow**: 1-2% fees ($230K-$460K), still requires trusting the escrow
4. ❌ **Legal agreement**: Weeks of lawyers, only works if same jurisdiction

**There's no way to settle large OTC trades trustlessly with privacy.**

## The Solution (45 seconds)

**BlackTrace = HTLC-based atomic swaps + end-to-end encrypted negotiation**

**How it works:**
1. Alice sends **encrypted order** directly to Bob (peer-to-peer, no broadcast)
2. Bob sends **encrypted proposal** back to Alice
3. Alice accepts
4. **Atomic swap via HTLCs**:
   - Alice locks 50,000 ZEC on Zcash L1 (Orchard)
   - Bob locks $23M USDC on zTarknet (Starknet)
   - Both claim with secret reveal, or both refund

**Result**: Trustless, atomic, private settlement. No counterparty risk, no front-running, no KYC.

## Market Opportunity (30 seconds)

**Target Users:**
- 🏛️ **DAO Treasuries**: $100B+ in crypto treasuries need trustless execution
- 🐋 **Privacy Whales**: Don't want KYC, don't want desks seeing their positions
- 🌍 **Cross-border Trades**: No legal framework, code is the contract

**Why Now:**
- OTC trading volume: $10B+/day (CryptoCompare, 2024)
- Front-running cost: ~$1.5B/year (Flashbots MEV research)
- DAO treasuries growing 40% YoY (DeepDAO)

## Technical Innovation (30 seconds)

1. **Encrypted P2P Order Routing**: Orders sent peer-to-peer (ECIES), never broadcast
2. **Cross-chain HTLCs**: Zcash L1 (Orchard) ↔ Starknet (zTarknet)
3. **Modular Settlement**: NATS coordination layer, Rust HTLC engine
4. **Privacy-First**: Zcash shielded pools for institutional holdings

**Stack**: Go (P2P coordination) + Rust (HTLC execution) + libp2p + NATS + Zcash + Starknet

## Demo (2 minutes)

**Split-screen institutional UI:**
- **Left**: Alice (Maker/DAO)
- **Right**: Bob (Taker/Whale)

**Live Flow:**
1. Alice creates order: "Sell 10,000 ZEC @ $465" → Encrypts → Sends to Bob
2. Bob sees encrypted blob → Clicks "Decrypt" → Views terms
3. Bob creates proposal → Encrypts → Sends to Alice
4. Alice decrypts → Reviews → Accepts
5. Settlement panel shows: NATS message → HTLC creation → Swap complete

**Visual Impact**: Judges see encrypted data transform into terms, trustless execution in real-time.

## Traction / Validation (15 seconds)

- ✅ 14/16 E2E tests passing
- ✅ Encrypted negotiation working
- ✅ NATS settlement coordination live
- ✅ Docker Compose full-stack demo
- 🚧 HTLC contracts (Zcash + Starknet) in progress

## Competitive Advantage (30 seconds)

| Feature | Traditional OTC | Escrow | DEXs | **BlackTrace** |
|---------|-----------------|--------|------|----------------|
| Counterparty Risk | ❌ High | ⚠️ Medium | ✅ None | ✅ **None** |
| Front-running | ❌ Yes | ⚠️ Possible | ❌ Yes | ✅ **No** |
| Privacy | ⚠️ Low | ⚠️ Low | ❌ Public | ✅ **Encrypted** |
| KYC Required | ✅ Yes | ✅ Yes | ❌ No | ❌ **No** |
| Cross-chain | ❌ No | ⚠️ Limited | ⚠️ Limited | ✅ **Yes** |

**Unique**: Only solution with trustless settlement + encrypted negotiation + cross-chain.

## Business Model (15 seconds)

**Phase 1 (Hackathon)**: Free, open-source protocol
**Phase 2**: 0.05-0.1% protocol fee (vs 1-2% escrow)
**Phase 3**: Premium features (multi-party trades, reputation, analytics)

**At $10B daily volume**: 0.1% fee = $10M/day revenue potential

## Roadmap (30 seconds)

**✅ Phase 1-3 (Complete)**:
- P2P networking + encryption
- NATS settlement coordination
- E2E test suite

**🚧 Phase 4 (Current)**:
- Institutional UI dashboard
- HTLC contracts (Zcash + Starknet)

**🔮 Phase 5 (Next)**:
- Solana settlement
- NEAR Intents integration
- Multi-party atomic swaps (>2 participants)

## Team Ask (15 seconds)

**What we need:**
- Smart contract audits (Zcash + Starknet HTLCs)
- UI/UX designer (institutional dashboard polish)
- Go-to-market (BD with DAOs/whales)

**Funding**: $500K seed for 6-month runway to production.

## Closing (15 seconds)

**BlackTrace enables a new category**: Trustless OTC for crypto-native institutions.

**No more getting rugged. No more front-running. Just code, privacy, and atomic swaps.**

**Questions?**

---

## Quick Stats

- **Total Addressable Market**: $10B+ daily OTC volume
- **Current Cost**: 1-2% escrow fees + front-running losses
- **Our Cost**: 0.1% protocol fee (10-20x cheaper)
- **Target**: $100M daily volume within 12 months (1,000 trades @ $100K avg)
- **Revenue**: $100K/day @ 0.1% fee = $36M/year

## Key Messaging

**For Judges:**
> "We're building the Bloomberg Terminal of trustless OTC - encrypted negotiation, atomic settlement, zero counterparty risk."

**For Investors:**
> "$10B daily OTC volume, 1-2% fees going to escrows. We're 10x cheaper and trustless. Massive opportunity."

**For Users:**
> "Found someone on Discord to trade $10M? We make sure neither of you gets rugged."

## Demo Script (2-min version)

**[0:00-0:15]** "Alice manages a DAO treasury. She wants to sell 10,000 ZEC for USDC. She finds Bob on Discord but doesn't trust him."

**[0:15-0:30]** "With BlackTrace, Alice creates an encrypted order and sends it directly to Bob. Watch the left side - she enters the terms, clicks encrypt, sends."

**[0:30-0:45]** "Bob receives an encrypted blob - see the right side. He clicks decrypt, sees the terms: 10,000 ZEC at $465."

**[0:45-1:00]** "Bob creates an encrypted proposal and sends it back to Alice. Notice everything is end-to-end encrypted - no one else can see these terms."

**[1:00-1:15]** "Alice decrypts Bob's proposal, reviews the terms, and clicks Accept."

**[1:15-1:45]** "Now the magic happens - our settlement service creates atomic HTLCs: Alice's 10,000 ZEC locked on Zcash, Bob's $4.65M USDC locked on Starknet. Both claim or both refund."

**[1:45-2:00]** "No counterparty risk. No front-running. No escrow fees. Just trustless execution. That's BlackTrace."

---

**TL;DR**: We're making it safe for strangers on the internet to trade millions of dollars. Trustlessly.
