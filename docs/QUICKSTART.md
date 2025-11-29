# BlackTrace Quickstart Guide

Get BlackTrace running in under 5 minutes.

## Prerequisites

- Docker and Docker Compose installed
- Git

## Quick Start

```bash
# Clone and start
git clone https://github.com/blacktrace-protocol/blacktrace.git
cd blacktrace

# Start core services
./scripts/start.sh

# Or start full stack with blockchain nodes
./scripts/start.sh full
```

**Access:**
- Frontend: http://localhost:5173
- Alice API: http://localhost:8080
- Bob API: http://localhost:8081
- NATS Monitor: http://localhost:8222

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
    │  Port: 8090             │
    └───────────┬─────────────┘
                │
    ┌───────────┴───────────┐
    │   (Full mode only)    │
    ▼                       ▼
┌──────────────┐    ┌───────────────────┐
│ Zcash Regtest│    │ Starknet Devnet   │
│ Port: 18232  │    │ Port: 5050        │
└──────────────┘    └───────────────────┘
```

## Startup Modes

| Mode | Command | Services |
|------|---------|----------|
| Demo | `./scripts/start.sh` | Core services only |
| Full | `./scripts/start.sh full` | Core + blockchain nodes |
| Blockchains | `./scripts/start.sh blockchains` | Blockchain nodes only |

## Demo Walkthrough

### 1. Register Users

**Alice (Maker):**
```bash
curl -X POST http://localhost:8080/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"test123"}'
```

**Bob (Taker):**
```bash
curl -X POST http://localhost:8081/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"bob","password":"test456"}'
```

### 2. Login

```bash
# Alice
ALICE_SESSION=$(curl -s -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"test123"}' | jq -r '.session_id')

# Bob
BOB_SESSION=$(curl -s -X POST http://localhost:8081/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"bob","password":"test456"}' | jq -r '.session_id')
```

### 3. Create Order (Alice)

```bash
ORDER_ID=$(curl -s -X POST http://localhost:8080/orders/create \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$ALICE_SESSION\",\"amount\":1,\"stablecoin\":\"USDC\",\"min_price\":100,\"max_price\":150}" | jq -r '.order_id')

echo "Order created: $ORDER_ID"
```

### 4. Submit Proposal (Bob)

```bash
curl -X POST http://localhost:8081/negotiate/propose \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$BOB_SESSION\",\"order_id\":\"$ORDER_ID\",\"price\":120,\"amount\":1}"
```

### 5. Accept Proposal (Alice)

```bash
PROPOSAL_ID=$(curl -s -X POST http://localhost:8080/negotiate/proposals \
  -H 'Content-Type: application/json' \
  -d "{\"order_id\":\"$ORDER_ID\"}" | jq -r '.proposals[0].proposal_id')

curl -X POST http://localhost:8080/negotiate/accept \
  -H 'Content-Type: application/json' \
  -d "{\"proposal_id\":\"$PROPOSAL_ID\"}"
```

### 6. Settlement

After acceptance, the settlement service coordinates the HTLC-based atomic swap:

1. Alice locks ZEC on Zcash
2. Bob locks USDC on Starknet
3. Alice claims USDC (reveals secret)
4. Bob claims ZEC (uses revealed secret)

Watch settlement logs:
```bash
docker-compose -f config/docker-compose.yml logs -f settlement-service
```

## Port Reference

| Port | Service | Description |
|------|---------|-------------|
| 4222 | NATS | Client connections |
| 8222 | NATS | HTTP monitoring |
| 8080 | Maker Node | Alice's HTTP API |
| 8081 | Taker Node | Bob's HTTP API |
| 8090 | Settlement | HTLC coordinator |
| 18232 | Zcash | Regtest RPC (full mode) |
| 5050 | Starknet | Devnet RPC (full mode) |

## Stopping Services

```bash
./scripts/stop.sh          # Stop demo mode
./scripts/stop.sh full     # Stop full stack
./scripts/stop.sh all -v   # Stop all + remove data
```

## Troubleshooting

### Services not starting
```bash
docker-compose -f config/docker-compose.yml ps
docker-compose -f config/docker-compose.yml logs nats
```

### Clean rebuild
```bash
./scripts/stop.sh all -v
./scripts/start.sh --clean
```

### Port conflicts
```bash
lsof -i :8080
```

## Next Steps

- [API Reference](API.md) - Complete endpoint documentation
- [Architecture](ARCHITECTURE.md) - System design details
- [Key Workflows](KEY_WORKFLOWS.md) - Order, Proposal, Settlement flows
