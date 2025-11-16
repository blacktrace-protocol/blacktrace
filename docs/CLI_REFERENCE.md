# BlackTrace CLI Reference

Complete command-line interface reference for the BlackTrace protocol.

## Installation

```bash
cd blacktrace-go
go build -o blacktrace
```

## Global Options

All commands support these global flags:

- `-h, --help`: Show help for any command

## Commands

### `blacktrace node`

Start a BlackTrace node that participates in the P2P network.

**Usage:**
```bash
blacktrace node [flags]
```

**Flags:**
- `-p, --port int`: Port to listen on (default: 9000)
- `-c, --connect string`: Multiaddr of peer to connect to (optional)

**Examples:**
```bash
# Start first node (bootstrap)
blacktrace node --port 9000

# Start second node and connect to first
blacktrace node --port 9001 --connect /ip4/127.0.0.1/tcp/9000/p2p/12D3KooW...
```

**Features:**
- Automatic peer discovery via mDNS
- Encrypted connections via Noise protocol
- Gossipsub for order broadcasts
- Direct streams for negotiations

---

### `blacktrace order`

Manage orders (create, list, query).

#### `blacktrace order create`

Create a new sell order for ZEC.

**Usage:**
```bash
blacktrace order create [flags]
```

**Flags:**
- `-a, --amount uint`: Amount of ZEC to sell (required)
- `-s, --stablecoin string`: Stablecoin type (USDC, USDT, DAI) (default: "USDC")
- `--min-price uint`: Minimum price per ZEC (required)
- `--max-price uint`: Maximum price per ZEC (required)

**Examples:**
```bash
# Create order for 10,000 ZEC at $450-$470
blacktrace order create \
  --amount 10000 \
  --stablecoin USDC \
  --min-price 450 \
  --max-price 470

# Create order for 5,000 ZEC accepting USDT
blacktrace order create \
  --amount 5000 \
  --stablecoin USDT \
  --min-price 460 \
  --max-price 480
```

**Output:**
```
📝 Creating order:
   Amount: 10000 ZEC
   Stablecoin: USDC
   Price Range: $450 - $470 per ZEC
   Total Range: $4500000 - $4700000 USDC

✅ Order created: order_1763291523
📤 Broadcasting to network...
```

#### `blacktrace order list`

List all orders discovered from connected peers.

**Usage:**
```bash
blacktrace order list
```

**Example Output:**
```
🔍 Listing all orders:

📋 Order ID: order_1763291523
   Type: Sell
   Stablecoin: USDC
   Timestamp: 1763291523

📋 Order ID: order_1763291689
   Type: Sell
   Stablecoin: USDT
   Timestamp: 1763291689
```

---

### `blacktrace negotiate`

Initiate negotiation or propose prices for an order.

#### `blacktrace negotiate request`

Request full details for an order (initiates negotiation).

**Usage:**
```bash
blacktrace negotiate request <order-id>
```

**Arguments:**
- `order-id`: The order ID to request details for

**Examples:**
```bash
blacktrace negotiate request order_1763291523
```

**Output:**
```
💬 Requesting details for order: order_1763291523
✅ Request sent to maker
📨 Waiting for response...
```

#### `blacktrace negotiate propose`

Propose a price for an order during negotiation.

**Usage:**
```bash
blacktrace negotiate propose <order-id> [flags]
```

**Arguments:**
- `order-id`: The order ID to propose a price for

**Flags:**
- `-p, --price uint`: Price per ZEC (required)
- `-a, --amount uint`: Amount of ZEC (required)

**Examples:**
```bash
# Propose $460 per ZEC for 10,000 ZEC
blacktrace negotiate propose order_1763291523 \
  --price 460 \
  --amount 10000

# Counter-propose $465
blacktrace negotiate propose order_1763291523 \
  --price 465 \
  --amount 10000
```

**Output:**
```
💰 Proposing for order: order_1763291523
   Price: $460 per ZEC
   Amount: 10000 ZEC
   Total: $4600000

✅ Proposal sent
```

---

### `blacktrace query`

Query node information (peers, status).

#### `blacktrace query peers`

List all peers currently connected to this node.

**Usage:**
```bash
blacktrace query peers
```

**Example Output:**
```
📡 Connected Peers:

🔗 12D3KooWM59JJQEmEd4ycgt6dQyk75oZBMoPLZbrbfB4p49fZky6
   Address: /ip4/127.0.0.1/tcp/9000

🔗 12D3KooWFCmvWgF5QnGrg5U5w2kjHJ5NZHpgvia5RrMr6mdQXnnY
   Address: /ip4/127.0.0.1/tcp/9001
```

#### `blacktrace query status`

Show the current status of this node.

**Usage:**
```bash
blacktrace query status
```

**Example Output:**
```
📊 Node Status:

Peer ID: 12D3KooWNVD43NBGCtg1TeJyQ9v24HnfKqqbhE1GYBawk3uPG54c
Listening: /ip4/0.0.0.0/tcp/9001
Peers: 2
Orders: 3
Uptime: 1h 23m 45s
```

---

## Workflow Examples

### Complete Two-Node Trading Workflow

**Terminal 1 (Maker - Node A):**
```bash
# Start node
./blacktrace node --port 9000
# Note the Peer ID from output

# Create sell order
./blacktrace order create \
  --amount 10000 \
  --stablecoin USDC \
  --min-price 450 \
  --max-price 470
```

**Terminal 2 (Taker - Node B):**
```bash
# Start node and connect
./blacktrace node --port 9001 \
  --connect /ip4/127.0.0.1/tcp/9000/p2p/[Node-A-Peer-ID]

# List discovered orders
./blacktrace order list

# Request order details
./blacktrace negotiate request order_[ID]

# Propose price
./blacktrace negotiate propose order_[ID] \
  --price 460 \
  --amount 10000
```

**Terminal 1 (Maker - Counter-propose):**
```bash
# Counter-propose higher price
./blacktrace negotiate propose order_[ID] \
  --price 465 \
  --amount 10000
```

**Terminal 2 (Taker - Accept):**
```bash
# Accept by matching price
./blacktrace negotiate propose order_[ID] \
  --price 465 \
  --amount 10000

# Agreement reached! (Would trigger HTLC settlement when on-chain integration is ready)
```

---

## Exit Codes

- `0`: Success
- `1`: General error
- `2`: Usage error (invalid flags/arguments)

---

## Environment Variables

Currently none. Configuration via flags only.

---

## See Also

- `docs/ARCHITECTURE.md` - System architecture
- `docs/MANUAL_TESTING.md` - Testing guide
- `docs/START_HERE.md` - Getting started
