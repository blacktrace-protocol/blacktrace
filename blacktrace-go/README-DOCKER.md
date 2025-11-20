# BlackTrace Docker Compose Setup

This setup demonstrates the complete BlackTrace system with NATS-based settlement coordination.

## Architecture

```
┌─────────────────┐       ┌─────────────────┐
│   Maker Node    │◄─────►│   Taker Node    │
│    (Alice)      │  P2P  │     (Bob)       │
│   Port: 8080    │       │   Port: 8081    │
└────────┬────────┘       └────────┬────────┘
         │                         │
         │   Publish Settlement    │
         │   Requests to NATS      │
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
    │  (Rust - Console Log)   │
    │  Listens to NATS        │
    └─────────────────────────┘
```

## Components

1. **NATS Server** - Message queue for settlement coordination
2. **Maker Node (Alice)** - Bootstrap P2P node on port 8080
3. **Taker Node (Bob)** - Regular P2P node on port 8081
4. **Settlement Service** - Rust service that logs settlement requests
5. **Test Runner** - Automated E2E test suite

## Quick Start

### Build and Run

```bash
# Build all images
docker-compose build

# Start all services
docker-compose up

# Or run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f settlement-service
```

### Run Tests

The test runner automatically executes after all services start:

```bash
# Follow test output
docker-compose logs -f test-runner
```

### Stop Services

```bash
docker-compose down

# Remove volumes as well
docker-compose down -v
```

## Testing the Settlement Flow

1. Start all services:
   ```bash
   docker-compose up
   ```

2. The test runner will automatically:
   - Create order (Alice)
   - Submit proposals (Bob)
   - Accept proposal (Alice)
   - **Trigger NATS settlement request**

3. Watch the settlement service logs:
   ```bash
   docker-compose logs -f settlement-service
   ```

4. You should see a detailed settlement request with:
   - Proposal and Order IDs
   - Maker and Taker peer IDs
   - Trade details (amount, price, stablecoin)
   - Settlement chain (ztarknet)

## Manual Testing

To manually trigger orders:

```bash
# Register Alice
curl -X POST http://localhost:8080/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"test123"}'

# Login Alice
ALICE_SESSION=$(curl -s -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"test123"}' | jq -r '.session_id')

# Create order
ORDER_ID=$(curl -s -X POST http://localhost:8080/orders/create \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$ALICE_SESSION\",\"amount\":10000,\"stablecoin\":\"USDC\",\"min_price\":450,\"max_price\":470}" | jq -r '.order_id')

# Register and login Bob (on taker node)
BOB_SESSION=$(curl -s -X POST http://localhost:8081/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"bob","password":"test456"}' | jq -r '.session_id')

# Submit proposal
curl -X POST http://localhost:8081/negotiate/propose \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$BOB_SESSION\",\"order_id\":\"$ORDER_ID\",\"price\":460,\"amount\":10000}"

# Accept proposal (back on maker node)
PROPOSAL_ID=$(curl -s -X POST http://localhost:8080/negotiate/proposals \
  -H 'Content-Type: application/json' \
  -d "{\"order_id\":\"$ORDER_ID\"}" | jq -r '.proposals[0].proposal_id')

curl -X POST http://localhost:8080/negotiate/accept \
  -H 'Content-Type: application/json' \
  -d "{\"proposal_id\":\"$PROPOSAL_ID\"}"
```

## Environment Variables

- `NATS_URL` - NATS server URL (default: `nats://nats:4222`)
- `NODE_TYPE` - Node type: `bootstrap` or `regular`
- `P2P_PORT` - P2P listening port
- `API_PORT` - HTTP API port
- `NODE_NAME` - Node identifier
- `RUST_LOG` - Rust logging level (default: `info`)

## Next Steps (Phase 3 Implementation)

Currently, the settlement service is a **console logger**. Next steps:

1. **HTLC Secret Generation** - Generate preimage and hash
2. **Zcash Client** - Create Orchard HTLC transactions
3. **Starknet Client** - Deploy and interact with Cairo HTLC contracts
4. **HTLC Monitoring** - Watch for claims and reveals
5. **Atomic Swap Completion** - Coordinated claim with secret reveal

## Troubleshooting

### Services not starting

```bash
# Check service status
docker-compose ps

# View logs for specific service
docker-compose logs nats
docker-compose logs node-maker
docker-compose logs settlement-service
```

### NATS connection errors

Ensure NATS server is healthy:
```bash
curl http://localhost:8222/healthz
```

### Build errors

Clean rebuild:
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

## Ports

- `4222` - NATS client connections
- `8222` - NATS HTTP monitoring
- `8080` - Maker node HTTP API
- `8081` - Taker node HTTP API
- `19000` - Maker node P2P
- `19001` - Taker node P2P
