# BlackTrace Docker Quickstart Guide

**Last Updated:** 2025-11-22

## Quick Start (All Services)

```bash
# Start everything with one command
./start.sh

# Or manually
docker-compose up --build -d
```

**Access the app:**
- 🌐 **Frontend:** http://localhost:5173
- 📡 **Alice API:** http://localhost:8080
- 📡 **Bob API:** http://localhost:8081
- 📊 **NATS Monitor:** http://localhost:8222

## Services Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network                            │
│                   (blacktrace-net)                          │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐            │
│  │   NATS   │◄───┤  Alice   │    │   Bob    │            │
│  │  :4222   │    │  :8080   │    │  :8081   │            │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘            │
│       │               │               │                    │
│       │               └───────┬───────┘                    │
│       │                       │                            │
│  ┌────▼─────────┐        ┌────▼─────────┐                │
│  │ Settlement   │        │   Frontend   │                 │
│  │  Service     │        │    :5173     │                 │
│  │  (Rust)      │        │   (React)    │                 │
│  └──────────────┘        └──────────────┘                 │
└─────────────────────────────────────────────────────────────┘
           │                       │
           └───────────┬───────────┘
                       │
              ┌────────▼─────────┐
              │   Your Browser   │
              │  localhost:5173  │
              └──────────────────┘
```

## Service Details

### NATS (Message Broker)
- **Container:** `blacktrace-nats`
- **Ports:** 4222 (client), 8222 (monitoring)
- **Purpose:** Coordinates messages between Go nodes and Rust settlement service
- **Healthcheck:** HTTP on port 8222

### Alice (Maker Node)
- **Container:** `blacktrace-maker`
- **Ports:** 8080 (API), 19000 (P2P)
- **Role:** Creates sell orders, accepts proposals
- **Environment:**
  - `NODE_NAME=alice`
  - `NODE_TYPE=bootstrap`
  - `NATS_URL=nats://nats:4222`

### Bob (Taker Node)
- **Container:** `blacktrace-taker`
- **Ports:** 8081 (API), 19001 (P2P)
- **Role:** Makes proposals, negotiates prices
- **Environment:**
  - `NODE_NAME=bob`
  - `NODE_TYPE=regular`
  - `BOOTSTRAP_PEER=/ip4/node-maker/tcp/19000`

### Settlement Service (Rust)
- **Container:** `blacktrace-settlement`
- **No exposed ports** (internal NATS communication only)
- **Purpose:**
  - Generates HTLC secrets and hashes
  - Coordinates atomic swap between Zcash and Starknet
  - Publishes settlement instructions via NATS
- **Logs:** See settlement events in real-time

### Frontend (React)
- **Container:** `blacktrace-frontend`
- **Port:** 5173
- **Tech:** React + Vite + TypeScript + Tailwind CSS
- **Features:**
  - Split-screen UI (Alice left, Bob right)
  - Order creation and negotiation
  - Settlement tabs for locking assets
  - Real-time updates via polling

## Usage Walkthrough

### 1. Start the Services

```bash
./start.sh
```

Wait ~30 seconds for all services to initialize.

### 2. Open the Frontend

Navigate to: http://localhost:5173

You'll see:
- **Left panel:** Alice (Maker)
- **Right panel:** Bob (Taker)

### 3. Create Users

**Alice Panel:**
1. Register: `alice` / `password123`
2. Login with same credentials

**Bob Panel:**
1. Register: `bob` / `password456`
2. Login with same credentials

### 4. Create an Order (Alice)

1. Go to Alice's **"Create Order"** tab
2. Fill in:
   - Amount: `100` ZEC
   - Stablecoin: `USDC`
   - Min Price: `40`
   - Max Price: `60`
   - Target Taker: `bob` (optional - for encrypted orders)
3. Click **"Create Order"**
4. Order appears in Alice's **"My Orders"** tab

### 5. Make a Proposal (Bob)

1. Go to Bob's **"Available Orders"** tab (formerly "Orders")
2. See Alice's order
3. Click **"Request Details"** (if encrypted)
4. Click **"Make Proposal"**
5. Enter:
   - Amount: `100` ZEC
   - Price: `$50`
6. Submit proposal
7. Proposal appears in Bob's **"My Proposals"** tab

### 6. Accept Proposal (Alice)

1. Go to Alice's **"Incoming Proposals"** tab (formerly "Proposals")
2. See Bob's proposal
3. Click **"Accept"**
4. Proposal status → **Accepted**

**What happens:**
- Backend publishes to NATS: `settlement.request.{proposal_id}`
- Settlement service activates!
- Order disappears from both "My Orders" tabs
- Proposal appears in both **Settlement** tabs

### 7. Lock ZEC (Alice)

1. Go to Alice's **"Settlement"** tab
2. See accepted proposal with status **"Ready to Lock ZEC"**
3. Click **"Lock 100 ZEC"**
4. Mock wallet popup (check console logs)
5. Status → **"ZEC Locked - Waiting for Bob"**

**What happens:**
- Backend → NATS: `settlement.status.*` (action: `alice_lock_zec`)
- Settlement service logs: "✅ ZEC lock confirmed"
- Proposal moves to Bob's Settlement tab

### 8. Lock USDC (Bob)

1. Go to Bob's **"Settlement"** tab
2. See proposal with status **"Alice Locked ZEC - Your Turn"**
3. Click **"Lock $5000 USDC"**
4. Mock wallet popup (check console logs)
5. Status → **"Both Locked"**

**What happens:**
- Backend → NATS: `settlement.status.*` (action: `bob_lock_usdc`)
- Settlement service logs: "🎉 BOTH ASSETS LOCKED!"
- Settlement service reveals secret
- Proposal appears in **Settlement Queue** (bottom panel)

### 9. View Settlement Queue

The **Settlement Queue** panel (bottom of screen) shows:
- All proposals where both assets are locked
- Ready for claiming (future feature)
- Settlement service has revealed the secret

## Viewing Logs

### All Logs
```bash
docker-compose logs -f
```

### Settlement Service Only
```bash
docker-compose logs -f settlement-service
```

**Example output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📩 NEW SETTLEMENT REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Proposal ID: order_123_proposal_456
  Order ID:    order_123

  👥 Parties:
     Maker:    Qm1234...
     Taker:    Qm5678...

  💰 Trade:
     Amount:   100 ZEC
     Price:    $50
     Total:    $5000

  🔐 HTLC Generated:
     Secret:   32 bytes (kept private)
     Hash:     a1b2c3d4e5f6...

  ✅ Settlement initialized
  📌 Status: ready → waiting for Alice to lock ZEC
```

### Specific Service Logs
```bash
docker-compose logs -f node-maker      # Alice
docker-compose logs -f node-taker      # Bob
docker-compose logs -f frontend        # React app
docker-compose logs -f nats            # Message broker
```

## Stopping Services

```bash
./stop.sh

# Or manually
docker-compose down
```

### Reset Everything (including data)
```bash
docker-compose down -v
```

This removes:
- All Docker volumes (user data, orders, proposals)
- Containers
- Networks

## Troubleshooting

### Services Not Starting

**Check Docker:**
```bash
docker --version
docker-compose --version
```

**Rebuild everything:**
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Frontend Can't Connect to Backend

**Check if backends are running:**
```bash
curl http://localhost:8080/health
curl http://localhost:8081/health
```

**Check Docker network:**
```bash
docker network inspect blacktrace_blacktrace-net
```

### Settlement Service Not Receiving Messages

**Check NATS connection:**
```bash
curl http://localhost:8222/varz
```

**Verify NATS topics:**
```bash
docker-compose logs settlement-service | grep "Subscribed"
```

Should see:
```
✓ Subscribed to settlement requests
✓ Subscribed to settlement status updates
```

### Port Conflicts

If ports are already in use:

**Option 1: Change ports in docker-compose.yml**
```yaml
ports:
  - "5174:5173"  # Change 5173 to 5174
```

**Option 2: Stop conflicting services**
```bash
lsof -i :5173  # Find process using port
kill -9 <PID>  # Kill the process
```

## Development Mode

To run services individually for development:

### Run Backend Locally (Outside Docker)

```bash
# Terminal 1: Alice
NATS_URL=nats://localhost:4222 ./blacktrace --port 8080

# Terminal 2: Bob
NATS_URL=nats://localhost:4222 ./blacktrace --port 8081
```

### Run Frontend Locally (Outside Docker)

```bash
cd frontend
npm install
npm run dev
```

### Run Settlement Service Locally (Outside Docker)

```bash
cd settlement-service
NATS_URL=nats://localhost:4222 cargo run
```

**Keep NATS in Docker:**
```bash
docker-compose up -d nats
```

## Running Tests

```bash
docker-compose --profile test up --build test-runner
```

Or run specific test:
```bash
docker-compose run test-runner /bin/sh -c "cd /tests && ./specific-test.sh"
```

## Advanced Configuration

### Environment Variables

Create `.env` file in project root:

```bash
# NATS Configuration
NATS_URL=nats://nats:4222

# Node Configuration
NODE_NAME_ALICE=alice
NODE_NAME_BOB=bob

# Logging
RUST_LOG=settlement_service=debug
LOG_LEVEL=debug

# API Ports
ALICE_PORT=8080
BOB_PORT=8081
FRONTEND_PORT=5173
```

### Custom Build Args

```bash
# Build with specific Rust version
docker-compose build --build-arg RUST_VERSION=1.75 settlement-service

# Build with specific Node version
docker-compose build --build-arg NODE_VERSION=20 frontend
```

## Architecture Flow Diagram

```
User Browser (localhost:5173)
    │
    ├─── HTTP ──► Alice API (localhost:8080)
    │                 │
    │                 ├─── P2P ──► Bob Node
    │                 │
    │                 └─── NATS ──► Settlement Service
    │                                     │
    └─── HTTP ──► Bob API (localhost:8081)
                      │
                      └─── NATS ──► Settlement Service

Settlement Flow:
1. Alice accepts proposal → NATS message
2. Settlement service generates HTLC secret
3. Alice locks ZEC → NATS message
4. Bob locks USDC → NATS message
5. Settlement service reveals secret
6. Both can claim (future feature)
```

## Next Steps

- [ ] Add real Zcash wallet integration
- [ ] Deploy HTLC contract to Starknet testnet
- [ ] Implement claim transactions
- [ ] Add transaction monitoring
- [ ] Create production deployment guide

## Support

- **Documentation:** See `/docs` folder
- **Issues:** https://github.com/your-org/blacktrace/issues
- **Logs:** `docker-compose logs -f`

---

**Ready to test?** Run `./start.sh` and visit http://localhost:5173 🚀
