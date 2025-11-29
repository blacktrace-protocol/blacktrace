# BlackTrace

**Cross-chain settlement without the bridge.**

Bridges get hacked. Over $2 billion lost to Wormhole, Ronin, Nomad, and others. Why? Because bridges hold your assets while they move.

BlackTrace is different. Your assets stay in your control, locked by cryptographic escrow. You get paid or you get refunded. That's it.

## Why Not Just Use a Bridge?

Bridges require someone to hold your assets while they move across chains. That custodian is an attack vector.

BlackTrace uses **hash-locked escrows** instead:
- Assets **stay on their native chains** until you claim
- Locked by **cryptography**, not custody
- If anything fails, **timeouts refund automatically**

It's the difference between handing someone your keys and using a lockbox only you control.

## How It Works

Alice wants to sell 1 ZEC. Bob wants to buy it with USDC.

Instead of trusting a bridge—or each other—they use a **hash-locked escrow**:

1. Alice locks her ZEC on Zcash with a secret key
2. Bob locks his USDC on Starknet with the *same* key
3. Alice claims the USDC by revealing the secret
4. Bob sees the secret and claims the ZEC

**Both get paid, or both get refunded.** No bridge. No custody. No trust.

## What Makes This Different

| Feature | Bridges | BlackTrace |
|---------|---------|------------|
| **Custody** | Bridge holds your assets | Assets stay on native chains |
| **Risk** | Smart contract exploits, hacks | Cryptographic escrow only |
| **Failure mode** | Funds stuck or stolen | Automatic timeout refunds |
| **Pricing** | Fixed pools, slippage | Negotiated OTC rates |
| **Privacy** | Public order books | Encrypted P2P negotiation |

## Architecture

```
┌─────────────────┐       ┌─────────────────┐
│   Maker Node    │◄─────►│   Taker Node    │
│    (Alice)      │  P2P  │     (Bob)       │
│   Port: 8080    │       │   Port: 8081    │
└────────┬────────┘       └────────┬────────┘
         │                         │
         └────────┬────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │  NATS Server   │
         │  Port: 4222    │
         └────────┬───────┘
                  │
                  ▼
    ┌─────────────────────────┐
    │  Settlement Service     │
    │  (Go + Zcash/Starknet)  │
    │  Port: 8090             │
    └───────────┬─────────────┘
                │
    ┌───────────┴───────────┐
    ▼                       ▼
┌──────────────┐    ┌───────────────────┐
│ Zcash        │    │ Starknet          │
│ (HTLC)       │    │ (HTLC Contract)   │
└──────────────┘    └───────────────────┘
```

## Quick Start

```bash
# Start all services
./scripts/start.sh

# Or with blockchain nodes for full settlement testing
./scripts/start.sh full
```

**Access:**
- Frontend: http://localhost:5173
- Alice API: http://localhost:8080
- Bob API: http://localhost:8081

See [docs/QUICKSTART.md](docs/QUICKSTART.md) for detailed setup instructions.

## Technology

- **P2P Network**: libp2p with GossipSub for peer discovery
- **Encryption**: ECIES (P-256) for end-to-end encrypted negotiation
- **Settlement**: HTLC atomic swaps (Zcash + Starknet)
- **Coordination**: Go nodes + NATS message broker
- **Hash Algorithm**: RIPEMD160(SHA256(secret)) for hash locks

## Documentation

### Core Docs
- [Quickstart Guide](docs/QUICKSTART.md) - Get running in 5 minutes
- [Architecture](docs/ARCHITECTURE.md) - System design and components
- [API Reference](docs/API.md) - Complete endpoint documentation
- [Key Workflows](docs/KEY_WORKFLOWS.md) - Order, Proposal, Settlement flows
- [Demo Script](docs/DEMO_SCRIPT.md) - Presentation talking points

### Reference
- [Settlement Details](docs/SETTLEMENT.md) - HTLC implementation details
- [HTLC Architecture](docs/reference/HTLC_ARCHITECTURE.md) - Technical deep-dive
- [Chain Connectors](docs/reference/CHAIN_CONNECTORS.md) - Adding new chains
- [CLI Testing](docs/reference/CLI_TESTING.md) - Manual testing commands

### Proposals
- [JS SDK Proposal](docs/proposals/PROPOSAL_JS_SDK.md) - Future SDK design
- [Developer Page](docs/proposals/DEVELOPERS.md) - Developer positioning

## Project Status

### Completed
- P2P networking with libp2p
- User authentication & ECDSA key management
- Encrypted order routing (ECIES)
- Encrypted proposals and acceptance
- NATS settlement coordination
- Zcash HTLC script generation and claiming
- Docker Compose orchestration

### In Progress
- Starknet HTLC contract deployment
- Frontend settlement UI
- End-to-end atomic swap testing

## Target Users

- **DAO Treasuries**: Trustless settlement with on-chain transparency
- **Privacy Whales**: No KYC, no desk seeing your positions
- **Cross-border Traders**: No legal framework needed
- **Discord/Telegram Deals**: Found counterparty online, need trustless execution

## License

MIT

---

**BlackTrace: Lock, swap, done.**
