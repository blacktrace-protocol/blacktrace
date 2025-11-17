# Two-Node P2P Maker/Taker Demo

Complete demonstration of BlackTrace's P2P functionality with two nodes exchanging orders and negotiating.

---

## Setup

### Terminal 1: Start Node A (Maker)

```bash
./blacktrace node --port 9000 --api-port 8080 > /tmp/node-a.log 2>&1 &
```

**Output:**
```
╔══════════════════════════════════════════════╗
║   BlackTrace Node                           ║
╚══════════════════════════════════════════════╝

🚀 Starting BlackTrace node...
   P2P Port: 9000
   API Port: 8080

✅ Node started successfully!

📍 Node Info:
   Peer ID: 12D3KooWFHp66BPbr3p8bXpf6XgkKN7GJJq2E1oxJYnoXg5JbZuQ
   Listening on: /ip4/127.0.0.1/tcp/9000

🔌 API Server: http://localhost:8080

🔍 Use this multiaddr to connect other nodes:
   /ip4/127.0.0.1/tcp/9000/p2p/12D3KooWFHp66BPbr3p8bXpf6XgkKN7GJJq2E1oxJYnoXg5JbZuQ
```

### Terminal 2: Start Node B (Taker)

```bash
./blacktrace node --port 9001 --api-port 8081 \
  --connect /ip4/127.0.0.1/tcp/9000/p2p/12D3KooWFHp66BPbr3p8bXpf6XgkKN7GJJq2E1oxJYnoXg5JbZuQ \
  > /tmp/node-b.log 2>&1 &
```

**Output:**
```
🚀 Starting BlackTrace node...
   P2P Port: 9001
   API Port: 8081

✅ Node started successfully!

📍 Node Info:
   Peer ID: 12D3KooWJe62dD5Pmih7uSL9Ph29FvdB3Jfot8yVT8V54LDAiZ2W
   Listening on: /ip4/127.0.0.1/tcp/9001

🔗 Connecting to peer: /ip4/127.0.0.1/tcp/9000/p2p/12D3KooWFHp66...

Discovered peer via mDNS: 12D3KooWFHp66BPbr3p8bXpf6XgkKN7GJJq2E1oxJYnoXg5JbZuQ
Connected to peer: 12D3KooWFHp66BPbr3p8bXpf6XgkKN7GJJq2E1oxJYnoXg5JbZuQ
```

---

## Verification: Check Peer Connections

### Query Node A Peers

```bash
./blacktrace query peers
```

**Output:**
```
📡 Connected Peers:

🔗 12D3KooWJe62dD5Pmih7uSL9Ph29FvdB3Jfot8yVT8V54LDAiZ2W
   Address: /ip4/127.0.0.1/tcp/9001

Total: 1 peers
```

### Query Node B Peers

```bash
./blacktrace --api-url http://localhost:8081 query peers
```

**Output:**
```
📡 Connected Peers:

🔗 12D3KooWFHp66BPbr3p8bXpf6XgkKN7GJJq2E1oxJYnoXg5JbZuQ
   Address: /ip4/127.0.0.1/tcp/9000

Total: 1 peers
```

✅ **Both nodes see each other!**

---

## Test 1: Order Propagation via Gossipsub

### Step 1: Create Order on Node A (Maker)

```bash
./blacktrace order create \
  --amount 50000 \
  --stablecoin USDC \
  --min-price 455 \
  --max-price 475
```

**Output:**
```
📝 Creating order:
   Amount: 50000 ZEC
   Stablecoin: USDC
   Price Range: $455 - $475 per ZEC
   Total Range: $22750000 - $23750000 USDC

✅ Order created: order_1763359394
📤 Broadcasting to network...
```

**Node A Log:**
```
App: Created and broadcast order: order_1763359394
Broadcast 199 bytes via pubsub
```

**Node B Log:**
```
Received 199 bytes via pubsub from 12D3KooWFHp66BPbr3p8bXpf6XgkKN7GJJq2E1oxJYnoXg5JbZuQ
App: Received order announcement: order_1763359394
```

### Step 2: Verify Order on Node A

```bash
./blacktrace order list
```

**Output:**
```
🔍 Listing all orders:

📋 Order ID: order_1763359394
   Type: Sell
   Stablecoin: USDC
   Timestamp: 1.763359394e+09

Total: 1 orders
```

### Step 3: Verify Order Propagated to Node B

```bash
./blacktrace --api-url http://localhost:8081 order list
```

**Output:**
```
🔍 Listing all orders:

📋 Order ID: order_1763359394
   Type: Sell
   Stablecoin: USDC
   Timestamp: 1.763359394e+09

Total: 1 orders
```

✅ **Gossipsub successfully propagated order from Node A to Node B!**

---

## Test 2: Negotiation (Request + Propose)

### Step 1: Node B Requests Order Details

```bash
./blacktrace --api-url http://localhost:8081 negotiate request order_1763359394
```

**Output:**
```
💬 Requesting details for order: order_1763359394
✅ Request sent to maker
📨 Waiting for response...
```

**Node B Log:**
```
App: Requested details for order: order_1763359394
Broadcast 53 bytes via pubsub
```

**Node A Log:**
```
Received 53 bytes via pubsub from 12D3KooWJe62dD5Pmih7uSL9Ph29FvdB3Jfot8yVT8V54LDAiZ2W
App: Received order request: order_1763359394 from 12D3KooWJe62dD5Pmih7uSL9Ph29FvdB3Jfot8yVT8V54LDAiZ2W
App: Sent order details to 12D3KooWJe62dD5Pmih7uSL9Ph29FvdB3Jfot8yVT8V54LDAiZ2W
Sent 153 bytes via stream to 12D3KooWJe62dD5Pmih7uSL9Ph29FvdB3Jfot8yVT8V54LDAiZ2W
```

**Node B Log (continued):**
```
Received 153 bytes via stream from 12D3KooWFHp66BPbr3p8bXpf6XgkKN7GJJq2E1oxJYnoXg5JbZuQ
App: Received order details: order_1763359394
```

✅ **Direct stream communication working!** Order details sent via libp2p stream (not gossipsub).

### Step 2: Node B Proposes a Price

```bash
./blacktrace --api-url http://localhost:8081 negotiate propose order_1763359394 \
  --price 465 \
  --amount 50000
```

**Output:**
```
💰 Proposing for order: order_1763359394
   Price: $465 per ZEC
   Amount: 50000 ZEC
   Total: $23250000

✅ Proposal sent
```

**Node B Log:**
```
App: Proposed price $465 for order order_1763359394
Broadcast 153 bytes via pubsub
```

**Node A Log:**
```
Received 153 bytes via pubsub from 12D3KooWJe62dD5Pmih7uSL9Ph29FvdB3Jfot8yVT8V54LDAiZ2W
App: Received proposal for order_1763359394: $465
```

✅ **Proposal successfully broadcast and received!**

---

## Architecture Verification

### ✅ What We Demonstrated:

1. **P2P Discovery**
   - mDNS automatic peer discovery
   - Manual connection via multiaddr
   - Bidirectional peer awareness

2. **Gossipsub (Broadcast Communication)**
   - Order announcements (199 bytes)
   - Order requests (53 bytes)
   - Price proposals (153 bytes)

3. **Direct Streams (Point-to-Point Communication)**
   - Order details sent via stream (153 bytes)
   - Sensitive data kept off broadcast channel

4. **CLI → HTTP API → Node Architecture**
   - Node A: CLI talks to `http://localhost:8080`
   - Node B: CLI talks to `http://localhost:8081`
   - API server routes commands to application layer
   - Application layer manages P2P network

5. **Message Flow**
   ```
   Node A (Maker)                      Node B (Taker)
   ─────────────                       ─────────────

   [Create Order]
        │
        ├─> Gossipsub ─────────────> [Receive Order]

   [Receive Request] <──── Pubsub <─── [Request Details]
        │
        └─> Stream ────────────────> [Receive Details]

   [Receive Proposal] <── Pubsub <─── [Propose Price]
   ```

---

## Key Observations

### 1. Transport Selection
- **Gossipsub**: Order announcements, requests, proposals
- **Streams**: Order details (sensitive data)

### 2. Message Sizes
- Order announcement: 199 bytes
- Order request: 53 bytes
- Order details (stream): 153 bytes
- Proposal: 153 bytes

### 3. Peer Discovery
- mDNS discovered peers automatically
- Manual `--connect` flag also worked
- Both methods resulted in successful connection

### 4. Real-Time Propagation
- Order appeared on Node B immediately after creation
- No polling needed
- Event-driven architecture via channels

---

## Next Steps

✅ **Off-chain workflow complete!**

Remaining tasks:
1. Implement Zcash L1 RPC client and Orchard HTLC builder
2. Implement Ztarknet L2 client and Cairo HTLC interface
3. Build two-layer settlement coordinator (L1 + L2 HTLCs with same secret)
4. Implement dual-layer blockchain monitor (watch L1 for ZEC, L2 for secret reveals)
5. End-to-end atomic swap testing (ZEC ↔ USDC via two-layer HTLC)

---

**Last Updated:** 2025-11-17
**Status:** ✅ Two-node P2P maker/taker workflow fully functional
