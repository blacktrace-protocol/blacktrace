# BlackTrace Docker Setup Guide

This guide covers the Docker Compose setup for BlackTrace, including how to run different configurations for development, testing, and demos.

## Overview

BlackTrace uses **separate Docker Compose files** to keep core services independent from blockchain nodes:

| File | Description |
|------|-------------|
| `config/docker-compose.yml` | Core BlackTrace services (NATS, nodes, settlement) |
| `config/docker-compose.blockchains.yml` | Blockchain devnet nodes (Zcash regtest, Starknet devnet) |

This separation allows you to:
- Run quick demos without heavyweight blockchain nodes
- Test blockchain integrations separately
- Use external blockchain nodes (testnet/mainnet) instead of local devnets

## Quick Start

### Using the Startup Scripts (Recommended)

```bash
# Start core services only (demo mode)
./scripts/start.sh

# Start full stack with blockchain nodes
./scripts/start.sh full

# Start with fresh volumes (clean state)
./scripts/start.sh full --clean

# Stop services
./scripts/stop.sh
./scripts/stop.sh full

# Stop and remove volumes
./scripts/stop.sh all -v
```

### Using Docker Compose Directly

```bash
cd config

# Core services only
docker-compose up

# Full stack with blockchain nodes
docker-compose -f docker-compose.yml -f docker-compose.blockchains.yml up

# Blockchain nodes only
docker-compose -f docker-compose.blockchains.yml up

# Stop services
docker-compose down
docker-compose -f docker-compose.yml -f docker-compose.blockchains.yml down
```

## Startup Modes

### Demo Mode (Default)

Starts core BlackTrace services for demonstrating encrypted P2P negotiation:

```bash
./scripts/start.sh demo
# or just
./scripts/start.sh
```

**Services started:**
- NATS message broker (port 4222)
- Maker node / Alice (port 8080)
- Taker node / Bob (port 8081)
- Settlement service (port 8090)

**Use case:** Demos, development, testing negotiation flow without actual HTLC settlement.

### Full Mode

Starts everything including blockchain devnet nodes:

```bash
./scripts/start.sh full
```

**Services started:**
- All demo mode services, plus:
- Zcash regtest node (port 18232)
- Starknet devnet node (port 5050)

**Use case:** Testing actual HTLC settlement, end-to-end integration tests.

### Blockchains Only Mode

Starts only the blockchain nodes:

```bash
./scripts/start.sh blockchains
```

**Services started:**
- Zcash regtest node (port 18232)
- Starknet devnet node (port 5050)

**Use case:** Running blockchain nodes separately (e.g., for local development against persistent nodes).

## Script Options

### start.sh

```
Usage: ./scripts/start.sh [mode] [options]

Modes:
  demo        Core services only (default)
  full        Full stack with blockchain nodes
  blockchains Blockchain nodes only

Options:
  --build     Force rebuild of Docker images (default)
  --no-build  Skip rebuilding images
  --detach    Run containers in background (default)
  --attach    Run in foreground (follow logs)
  --clean     Remove volumes before starting (fresh state)
  --help      Show help message
```

### stop.sh

```
Usage: ./scripts/stop.sh [mode] [options]

Modes:
  demo        Stop core services only (default)
  full        Stop all services including blockchain nodes
  blockchains Stop blockchain nodes only
  all         Stop everything (both compose files)

Options:
  --volumes, -v  Also remove volumes (reset all data)
  --help         Show help message
```

## Environment Variables

You can override blockchain connection settings without modifying compose files:

```bash
# Use external Zcash node
ZCASH_RPC_URL=http://my-zcash-node:8232 ./scripts/start.sh

# Use Starknet Sepolia testnet instead of devnet
STARKNET_RPC_URL=https://starknet-sepolia.infura.io/v3/YOUR_KEY ./scripts/start.sh

# Custom Zcash credentials
ZCASH_RPC_USER=myuser ZCASH_RPC_PASSWORD=mypass ./scripts/start.sh full
```

**Available environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `ZCASH_RPC_URL` | `http://zcash-regtest:18232` | Zcash node RPC endpoint |
| `ZCASH_RPC_USER` | `blacktrace` | Zcash RPC username |
| `ZCASH_RPC_PASSWORD` | `regtest123` | Zcash RPC password |
| `ZCASH_NETWORK` | `regtest` | Zcash network (regtest, testnet, mainnet) |
| `STARKNET_RPC_URL` | `http://starknet-devnet:5050` | Starknet RPC endpoint |
| `STARKNET_NETWORK` | `devnet` | Starknet network identifier |

## Port Reference

### Core Services

| Port | Service | Description |
|------|---------|-------------|
| 4222 | NATS | Client connections |
| 8222 | NATS | HTTP monitoring UI |
| 8080 | Maker Node | Alice's HTTP API |
| 8081 | Taker Node | Bob's HTTP API |
| 8090 | Settlement | HTLC coordinator API |
| 19000 | Maker Node | P2P port |
| 19001 | Taker Node | P2P port |

### Blockchain Nodes

| Port | Service | Description |
|------|---------|-------------|
| 18232 | Zcash Regtest | RPC port |
| 18233 | Zcash Regtest | P2P port |
| 5050 | Starknet Devnet | RPC port |

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
    │  (Rust)                 │
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

## Troubleshooting

### Services not starting

```bash
# Check service status
docker-compose -f config/docker-compose.yml ps

# View logs for specific service
docker-compose -f config/docker-compose.yml logs nats
docker-compose -f config/docker-compose.yml logs node-maker
docker-compose -f config/docker-compose.yml logs settlement-service
```

### NATS connection errors

```bash
# Check NATS health
curl http://localhost:8222/healthz
```

### Blockchain node issues

```bash
# Check Zcash node
docker-compose -f config/docker-compose.blockchains.yml logs zcash-regtest

# Check Starknet devnet
curl http://localhost:5050/is_alive
```

### Clean rebuild

```bash
# Stop everything and remove volumes
./scripts/stop.sh all -v

# Rebuild from scratch
./scripts/start.sh full --clean
```

### Port conflicts

If you have other services using the default ports, you can modify them in the compose files or use environment overrides:

```bash
# Check what's using a port
lsof -i :8080
```

## Development Workflow

### Typical development cycle

```bash
# 1. Start services in demo mode
./scripts/start.sh

# 2. Make code changes...

# 3. Rebuild and restart
./scripts/start.sh --build

# 4. Run with fresh data
./scripts/start.sh --clean
```

### Testing HTLC settlement

```bash
# 1. Start full stack with blockchain nodes
./scripts/start.sh full

# 2. Wait for blockchain nodes to be ready
docker-compose -f config/docker-compose.yml -f config/docker-compose.blockchains.yml logs -f zcash-regtest

# 3. Fund test wallets (if applicable)
./scripts/fund-wallets.sh

# 4. Run settlement tests...
```

### Viewing logs

```bash
# All services
docker-compose -f config/docker-compose.yml logs -f

# Specific service
docker-compose -f config/docker-compose.yml logs -f settlement-service

# With timestamps
docker-compose -f config/docker-compose.yml logs -f -t
```

## Files Reference

```
blacktrace/
├── config/
│   ├── docker-compose.yml           # Core services
│   ├── docker-compose.blockchains.yml  # Blockchain nodes
│   └── zcash-regtest.conf           # Zcash node configuration
├── scripts/
│   ├── start.sh                     # Startup script
│   ├── stop.sh                      # Stop script
│   └── clean-restart.sh             # Clean restart utility
└── docs/
    ├── DOCKER_SETUP.md              # This file
    └── README-DOCKER.md             # Docker overview
```
