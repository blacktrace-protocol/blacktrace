# BlackTrace Demo Video Script

**Duration:** ~5-7 minutes
**Tool:** Use any screen recording software (OBS Studio, Loom, QuickTime, Camtasia, etc.)
**Format:** 1080p recommended, 16:9 aspect ratio

---

## Pre-Recording Checklist

- [ ] All services running (`./start.sh`)
- [ ] Browser at http://localhost:5173 (maximized)
- [ ] Terminal ready with `docker-compose logs -f settlement-service`
- [ ] Split browser window: 50% frontend, 50% terminal (optional)
- [ ] Clear browser cache/cookies for fresh demo
- [ ] Test audio levels
- [ ] Close unnecessary apps/notifications

---

## Script

### INTRO (0:00 - 0:30)

**[Show title slide or frontend]**

**Narration:**
> "Hi, I'm [Your Name], and today I'm excited to show you **BlackTrace** - a trustless over-the-counter settlement protocol for institutional crypto trading.
>
> BlackTrace enables **atomic swaps** between Zcash and stablecoins on Starknet using **Hash Time-Locked Contracts**, without requiring trust in any third party.
>
> In this demo, we'll walk through a complete OTC trade from negotiation to settlement."

**[Screen: Show frontend with split-screen UI]**

---

### ARCHITECTURE OVERVIEW (0:30 - 1:15)

**[Show architecture diagram or switch between terminals]**

**Narration:**
> "BlackTrace consists of five main components:
>
> 1. **Alice** - The maker node running on port 8080, operated by a DAO treasury manager
> 2. **Bob** - The taker node on port 8081, operated by a privacy-focused whale
> 3. **NATS** - A message broker that coordinates settlement between nodes
> 4. **Settlement Service** - A Rust service that generates HTLC secrets and orchestrates the atomic swap
> 5. **React Frontend** - A split-screen UI showing both parties' perspectives
>
> All communication is peer-to-peer encrypted, and the settlement service never holds private keys."

**[Show `docker-compose ps` or service status]**

---

### PART 1: USER REGISTRATION (1:15 - 2:00)

**[Split screen showing Alice (left) and Bob (right)]**

**Narration:**
> "Let's start by registering both users.
>
> On the **left**, we have Alice, the maker. She wants to sell 100 ZEC for USDC."

**[Register Alice]**
- Username: `alice`
- Password: `password123`
- Click "Register & Login"

**Narration:**
> "Alice is now logged in and connected to the P2P network.
>
> On the **right**, we have Bob, the taker. He's interested in buying ZEC with privacy."

**[Register Bob]**
- Username: `bob`
- Password: `password456`
- Click "Register & Login"

**Narration:**
> "Both users are now online and can see each other's peer IDs."

---

### PART 2: ORDER CREATION (2:00 - 2:45)

**[Focus on Alice's panel]**

**Narration:**
> "Alice creates a sell order using the **Create Order** tab."

**[Click "Create Order" tab]**

**Narration:**
> "She wants to sell **100 ZEC** for **USDC**, with a price range between **$40 and $60** per ZEC.
>
> Since Alice knows Bob and wants privacy, she'll create an **encrypted order** targeted specifically to Bob."

**[Fill form]**
- Amount: `100`
- Stablecoin: `USDC`
- Min Price: `40`
- Max Price: `60`
- Target Taker Username: `bob`

**[Click "Create Order"]**

**Narration:**
> "The order is created! Notice it appears in Alice's **My Orders** tab with a count badge.
>
> The order is **encrypted** using Bob's public key via **ECIES**, so only Bob can see the details."

**[Show "My Orders" tab with order]**

---

### PART 3: PROPOSAL SUBMISSION (2:45 - 3:30)

**[Focus on Bob's panel]**

**Narration:**
> "Bob sees the order in his **Available Orders** tab, but the details are encrypted."

**[Show encrypted order in Bob's "Orders" tab]**

**Narration:**
> "Bob clicks **Request Details** to decrypt the order using his private key."

**[Click "Request Details"]**

**Narration:**
> "Now Bob can see the full details: 100 ZEC for sale, price range $40-60.
>
> Bob decides to make a proposal at **$50 per ZEC**, for a total of **$5,000 USDC**."

**[Click "Make Proposal"]**

**[Fill form]**
- Amount: `100`
- Price: `50`

**[Click "Submit Proposal"]**

**Narration:**
> "The proposal is encrypted and sent directly to Alice via the P2P network.
>
> Bob can track his proposal in the **My Proposals** tab."

**[Show "My Proposals" tab - status: Pending]**

---

### PART 4: PROPOSAL ACCEPTANCE (3:30 - 4:00)

**[Focus on Alice's panel]**

**Narration:**
> "Alice receives Bob's proposal in her **Incoming Proposals** tab."

**[Show "Proposals" tab with Bob's proposal]**

**Narration:**
> "She reviews it: 100 ZEC at $50 per ZEC, total value $5,000.
>
> Alice decides this is a fair price and clicks **Accept**."

**[Click "Accept" button]**

**[Switch to terminal showing settlement-service logs]**

**Narration:**
> "Watch what happens in the **settlement service** terminal...
>
> The settlement service immediately springs into action!"

**[Show settlement service logs:]**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📩 NEW SETTLEMENT REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🔐 HTLC Generated:
     Secret:   32 bytes (kept private)
     Hash:     a1b2c3d4e5f6...

  ✅ Settlement initialized
  📌 Status: ready → waiting for Alice to lock ZEC
```

**Narration:**
> "The service has generated a **cryptographically secure secret** and its corresponding hash.
>
> This hash will be used in the **Hash Time-Locked Contracts** on both blockchains."

---

### PART 5: ALICE LOCKS ZEC (4:00 - 4:45)

**[Back to frontend - Alice's panel]**

**Narration:**
> "Notice the order has disappeared from **My Orders** - it's now in the **Settlement** tab."

**[Click Alice's "Settlement" tab]**

**Narration:**
> "The accepted proposal appears here with status **Ready to Lock ZEC**.
>
> In production, this would open Alice's **Zcash wallet** to sign an HTLC transaction.
>
> For this demo, we're using a **mock wallet** to simulate the interaction."

**[Click "Lock 100 ZEC"]**

**[Show browser console if logging mock wallet]**

**Narration:**
> "The frontend simulates a wallet popup...
>
> Alice would review the transaction details and sign with her private key to create an HTLC that locks 100 ZEC."

**[Wait for response]**

**[Switch to settlement service logs]**

**Narration:**
> "The settlement service confirms Alice's lock..."

**[Show logs:]**
```
📬 SETTLEMENT STATUS UPDATE

  Action:      alice_lock_zec
  Status:      alice_locked

  🔒 Alice is locking 100 ZEC

  ✅ ZEC lock confirmed
  📌 Status: alice_locked → waiting for Bob to lock USDC
```

**[Back to frontend]**

**Narration:**
> "Alice's settlement tab now shows **ZEC Locked - Waiting for Bob**.
>
> The proposal has moved to Bob's Settlement tab."

---

### PART 6: BOB LOCKS USDC (4:45 - 5:30)

**[Focus on Bob's panel]**

**Narration:**
> "Bob sees the proposal in his **Settlement** tab with status **Alice Locked ZEC - Your Turn**."

**[Click Bob's "Settlement" tab]**

**Narration:**
> "The UI shows that Alice has locked 100 ZEC, and now Bob needs to lock $5,000 USDC.
>
> Because Alice locked first, Bob knows the swap is safe - the **atomic swap guarantee** ensures either both parties get their funds, or neither does."

**[Click "Lock $5000 USDC"]**

**[Show browser console]**

**Narration:**
> "Bob's Starknet wallet (ArgentX) would open in production.
>
> He would sign a transaction to lock USDC in an HTLC contract on Starknet."

**[Wait for response]**

**[Switch to settlement service logs]**

**Narration:**
> "The settlement service detects that **both assets are now locked**!"

**[Show logs:]**
```
📬 SETTLEMENT STATUS UPDATE

  Action:      bob_lock_usdc
  Status:      both_locked

  🔒 Bob is locking $5000 USDC

  ✅ USDC lock confirmed
  🎉 BOTH ASSETS LOCKED!

  📌 Status: both_locked → ready for claiming

  🔓 REVEALING SECRET FOR ATOMIC SWAP

  Secret (hex): abc123def456...
  Hash (hex):   a1b2c3d4e5f6...

  💡 Claims:
     1. Alice claims USDC on Starknet (reveals secret on-chain)
     2. Bob sees secret on Starknet, claims ZEC on Zcash

  ✨ ATOMIC SWAP READY FOR COMPLETION
```

**Narration:**
> "This is the magic moment!
>
> The settlement service has **revealed the secret** that was generated at the start.
>
> Now:
> - Alice can claim the $5,000 USDC on Starknet by revealing this secret in her transaction
> - Once Alice claims, the secret becomes **public on the Starknet blockchain**
> - Bob can then use that same secret to claim the 100 ZEC on Zcash
>
> The cryptographic guarantee ensures both parties receive their funds - it's **atomic** and **trustless**."

---

### PART 7: SETTLEMENT QUEUE (5:30 - 6:00)

**[Show Settlement Queue panel at bottom]**

**Narration:**
> "The **Settlement Queue** panel shows all proposals where both assets are locked.
>
> In the current demo, this is the final state. But in production, this panel would show:
> - Real-time HTLC status on both chains
> - Confirmation counts
> - Claim buttons for both parties
> - Transaction monitoring
>
> The settlement is now complete!"

---

### WRAP-UP (6:00 - 7:00)

**[Show terminal or architecture diagram]**

**Narration:**
> "Let's recap what we just saw:
>
> 1. **Encrypted Negotiation** - Alice and Bob negotiated privately using ECIES encryption
> 2. **Acceptance Trigger** - When Alice accepted, the settlement service generated HTLC parameters
> 3. **Sequential Locking** - Alice locked ZEC first, then Bob locked USDC
> 4. **Secret Reveal** - Once both locked, the service revealed the secret
> 5. **Atomic Swap** - Both parties can now claim their funds with cryptographic guarantees
>
> The key innovations here are:
> - **No custodian** - The settlement service never holds private keys or funds
> - **Privacy** - All negotiations are end-to-end encrypted
> - **Atomic** - Either both parties succeed or both get refunds
> - **Cross-chain** - Works between Zcash (privacy layer 1) and Starknet (validity rollup)
>
> This is **BlackTrace** - bringing institutional-grade OTC settlement to the privacy-preserving crypto ecosystem."

**[Show GitHub/docs]**

**Narration:**
> "All code is open source. Check out the documentation at [URL] for:
> - Complete HTLC architecture
> - Wallet integration guide
> - Production deployment instructions
> - Security considerations
>
> Thanks for watching!"

**[Fade out with project logo/name]**

---

## Post-Recording Checklist

- [ ] Review recording for audio quality
- [ ] Check that all text is readable
- [ ] Add captions/subtitles (optional but recommended)
- [ ] Add timestamps in description
- [ ] Export at 1080p 30fps minimum
- [ ] Upload to YouTube/Vimeo with tags:
  - `cryptocurrency`, `blockchain`, `atomic-swaps`, `HTLC`, `zcash`, `starknet`, `DeFi`, `OTC`

---

## Alternative: Shorter 2-Minute Version

For a quick demo, focus on:
1. Show UI (0:00-0:20)
2. Create order (0:20-0:40)
3. Make proposal (0:40-1:00)
4. Accept → Settlement service activates (1:00-1:20)
5. Lock assets → Both locked (1:20-1:50)
6. Explain atomic swap guarantee (1:50-2:00)

---

## Screen Recording Tips

**Software Recommendations:**
- **macOS:** QuickTime (free), ScreenFlow (paid)
- **Windows:** OBS Studio (free), Camtasia (paid)
- **Linux:** SimpleScreenRecorder (free), OBS Studio (free)
- **Cloud:** Loom (easy sharing), Screencastify

**Settings:**
- Resolution: 1920x1080 (1080p)
- Frame rate: 30 FPS
- Audio: Mono, 44.1kHz
- Mouse highlighting: ON
- Keyboard overlay: Optional

**Presentation:**
- Speak clearly and at moderate pace
- Pause after key actions
- Use zoom/highlight for important UI elements
- Add background music (low volume, royalty-free)

---

**Good luck with your demo video! 🎬**
