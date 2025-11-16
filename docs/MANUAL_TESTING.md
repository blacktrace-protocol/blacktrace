# BlackTrace Manual Testing Guide

This guide provides step-by-step instructions for manually testing all implemented features.

---

## Current Implementation Limitations

**What Works via CLI:**
- ✅ Node startup
- ✅ Peer connection
- ✅ Event loop (receives and processes network messages)

**What Requires Programmatic Testing:**
- ⏳ Order creation and broadcasting
- ⏳ Order discovery and listing
- ⏳ Negotiation (request details, propose, accept)
- ⏳ Settlement finalization

**Reason**: The order/negotiate/query CLI commands are not yet wired to the running node (requires IPC/RPC implementation). For now, we test the full workflow programmatically.

---

## Part 1: CLI-Based Testing (Node P2P)

### Test 1: Single Node Startup

**Objective**: Verify a BlackTrace node can start and listen for connections.

**Steps:**
```bash
# Build the CLI first (if not already built)
cd blacktrace-go
go build -o blacktrace

# Terminal 1
./blacktrace node --port 9000
```

**Expected Output:**
```
🚀 Starting BlackTrace node...
   Port: 9000

✅ Node started successfully!

📍 Node Info:
   Peer ID: 12D3KooWNVD43NBGCtg1TeJyQ9v24HnfKqqbhE1GYBawk3uPG54c
   Listening on: /ip4/0.0.0.0/tcp/9000

🔍 Use this multiaddr to connect:
   /ip4/127.0.0.1/tcp/9000/p2p/12D3KooWNVD43NBGCtg1TeJyQ9v24HnfKqqbhE1GYBawk3uPG54c
```

**Verification:**
- No errors or panics
- Process stays running
- libp2p peer ID displayed (format: 12D3Koo...)
- Port 9000 is listening (verify with `lsof -i :9000`)

**Result**: ✅ / ❌

---

### Test 2: Two Nodes with Peer Connection

**Objective**: Verify two nodes can connect to each other via libp2p.

**Steps:**
```bash
# Terminal 1 - Start first node (bootstrap)
./blacktrace node --port 9000
# Copy the multiaddr from the output (e.g., /ip4/127.0.0.1/tcp/9000/p2p/12D3Koo...)

# Terminal 2 - Start second node and connect to first
./blacktrace node --port 9001 --connect /ip4/127.0.0.1/tcp/9000/p2p/12D3KooW...
```

**Expected Output (Terminal 1):**
```
🚀 Starting BlackTrace node...
   Port: 9000

✅ Node started successfully!
📍 Node Info:
   Peer ID: 12D3KooWM59JJQEmEd4ycgt6dQyk75oZBMoPLZbrbfB4p49fZky6
   Listening on: /ip4/0.0.0.0/tcp/9000

🔍 Use this multiaddr to connect:
   /ip4/127.0.0.1/tcp/9000/p2p/12D3KooWM59JJQEmEd4ycgt6dQyk75oZBMoPLZbrbfB4p49fZky6

[Later] Discovered peer via mDNS: 12D3KooWFCmvWgF5QnGrg5U5w2kjHJ5NZHpgvia5RrMr6mdQXnnY
[Later] Bootstrap mode: waiting for peer to connect
```

**Expected Output (Terminal 2):**
```
🚀 Starting BlackTrace node...
   Port: 9001
   Connecting to: /ip4/127.0.0.1/tcp/9000/p2p/12D3KooWM59...

✅ Node started successfully!
📍 Node Info:
   Peer ID: 12D3KooWFCmvWgF5QnGrg5U5w2kjHJ5NZHpgvia5RrMr6mdQXnnY
   Listening on: /ip4/0.0.0.0/tcp/9001

Discovered peer via mDNS: 12D3KooWM59JJQEmEd4ycgt6dQyk75oZBMoPLZbrbfB4p49fZky6
Connected to peer: 12D3KooWM59JJQEmEd4ycgt6dQyk75oZBMoPLZbrbfB4p49fZky6
```

**Verification:**
- Both nodes show mDNS discovery messages
- Terminal 2 shows "Connected to peer" message
- Both nodes stay running
- No "noise: message is too short" errors (bootstrap pattern prevents bidirectional dial race)

**Result**: ✅ / ❌

---

### Test 3: Three-Node Network

**Objective**: Verify multiple peers can connect in a network.

**Steps:**
```bash
# Terminal 1 - Node A (bootstrap hub)
./blacktrace node --port 9000
# Copy the multiaddr

# Terminal 2 - Node B connects to A
./blacktrace node --port 9001 --connect /ip4/127.0.0.1/tcp/9000/p2p/[Node-A-ID]

# Terminal 3 - Node C connects to A
./blacktrace node --port 9002 --connect /ip4/127.0.0.1/tcp/9000/p2p/[Node-A-ID]
```

**Expected Behavior:**
- Node A (bootstrap) sees 2 peer connections via mDNS + incoming connections
- Nodes B and C each connect to A and discover each other via mDNS
- All nodes stay running
- Gossipsub mesh forms with all 3 nodes

**Verification:**
- Check logs for "Connected to peer" messages
- Node A should see 2 incoming connections
- Nodes B and C should each connect to at least 1 peer (A)
- mDNS should discover all peers on local network

**Result**: ✅ / ❌

---

### Test 4: CLI Help and Commands

**Objective**: Verify CLI help and command structure.

**Steps:**
```bash
# Show main help
./blacktrace --help

# Show node command help
./blacktrace node --help

# Show order command help
./blacktrace order --help

# Show negotiate command help
./blacktrace negotiate --help

# Show query command help
./blacktrace query --help
```

**Expected Output:**
- Clean help text for each command using cobra framework
- No errors or panics
- All subcommands listed correctly
- Usage examples and flag descriptions

**Result**: ✅ / ❌

---

### Test 5: Placeholder Commands

**Objective**: Verify placeholder commands show appropriate messages.

**Steps:**
```bash
# Try creating an order (shows formatted placeholder)
./blacktrace order create --amount 10000 --stablecoin USDC --min-price 450 --max-price 470

# Try listing orders
./blacktrace order list

# Try requesting negotiation
./blacktrace negotiate request order_1763291523

# Try proposing a price
./blacktrace negotiate propose order_1763291523 --price 460 --amount 10000

# Try querying peers
./blacktrace query peers

# Try querying status
./blacktrace query status
```

**Expected Output:**
- `order create` shows formatted order details and mock Order ID
- `order list` shows "No orders available (implementation pending)"
- `negotiate` commands show placeholder messages
- `query` commands show "implementation pending" messages

**Result**: ✅ / ❌

---

## Part 2: Programmatic Testing (Full Workflow)

The CLI commands are placeholders for now. To test the full workflow, we use the Go demo program which directly uses the app and network layers.

### Running the Go Demo

The demo is located at `blacktrace-go/examples/demo.go` and tests all 6 scenarios:

**To run:**
```bash
cd blacktrace-go
go run examples/demo.go
```

**Expected Output:**
```
=== BlackTrace Two-Node Demo ===

Starting Node A (Maker - Bootstrap) on port 19000...
Node A Peer ID: 12D3KooWM59JJQEmEd4ycgt6dQyk75oZBMoPLZbrbfB4p49fZky6

Starting Node B (Taker) on port 19001...
Node B Peer ID: 12D3KooWFCmvWgF5QnGrg5U5w2kjHJ5NZHpgvia5RrMr6mdQXnnY

Waiting for mDNS peer discovery...

--- Scenario 1: Order Creation ---
Node A creating order: 10000 ZEC for USDC ($450-$470)
✅ Order created and broadcast: order_1731234567

--- Scenario 2: Order Discovery ---
Waiting for order to propagate...
✅ Node B received order: order_1731234567

--- Scenario 3: Negotiation Request ---
Node B requesting details for order_1731234567
✅ Node A received negotiation request

--- Scenario 4: Price Proposal (Taker) ---
Node B proposing: $460 per ZEC
✅ Node A received price proposal: $460

--- Scenario 5: Counter-Proposal (Maker) ---
Node A counter-proposing: $465 per ZEC
✅ Node B received counter-proposal: $465

--- Scenario 6: Acceptance ---
Node B accepting final terms at $465
✅ Settlement finalized!

=== Demo Complete ===

Summary:
✅ All 6 scenarios passed
✅ No deadlocks (channel-based architecture works!)
✅ Order broadcast via Gossipsub
✅ Negotiation via direct libp2p streams
✅ Multi-round price discovery successful
```

**Verification Checklist:**
- [ ] No panics or errors
- [ ] Both libp2p nodes connect via mDNS
- [ ] Order successfully created and broadcast via Gossipsub
- [ ] Order received by peer
- [ ] Negotiation messages exchanged via direct streams
- [ ] Settlement terms finalized
- [ ] All 6 scenarios pass

**Key Technical Details:**
- **Gossipsub**: Used for broadcasting order announcements (pub/sub pattern)
- **Direct Streams**: Used for 1-to-1 negotiation messages (request/response pattern)
- **Bootstrap Pattern**: Node A passive (port 19000), Node B active (port 19001) to prevent dial race
- **Channel-based Architecture**: No Arc<Mutex<>> deadlocks like Rust TCP version had

---

## Test Scenarios Summary

### Scenario 1: Order Creation & Broadcasting
**Actors**: Node A (Maker)
**Steps**:
1. Node A creates sell order (10,000 ZEC for USDC)
2. Order is broadcast to all connected peers

**Success Criteria**:
- ✅ Order created with valid OrderID
- ✅ Commitment proof generated
- ✅ Order broadcast message sent
- ✅ No errors

---

### Scenario 2: Order Discovery
**Actors**: Node B (Taker)
**Steps**:
1. Node B receives order announcement
2. Node B lists all known orders

**Success Criteria**:
- ✅ Node B receives order message
- ✅ Order stored in local order book
- ✅ List shows correct order details
- ✅ Order ID, type, stablecoin match

---

### Scenario 3: Negotiation - Request Details
**Actors**: Node B (Taker) → Node A (Maker)
**Steps**:
1. Node B requests full order details
2. Node A reveals amount and price range

**Success Criteria**:
- ✅ Request message sent to Maker
- ✅ Negotiation session created (Taker role)
- ✅ State transitions to DetailsRequested
- ✅ No errors

---

### Scenario 4: Negotiation - Price Proposals
**Actors**: Multi-round between A and B
**Steps**:
1. Node B proposes: 460 USDC per ZEC
2. Sent via direct libp2p stream to Node A
3. Node A counter-proposes: 465 USDC per ZEC
4. Sent via direct libp2p stream to Node B

**Success Criteria**:
- ✅ Proposals sent via direct streams (not gossipsub)
- ✅ Each proposal logged by receiving node
- ✅ Multi-round negotiation works without deadlocks
- ✅ Latest price updates correctly

---

### Scenario 5: Negotiation - Acceptance & Finalization
**Actors**: Node B (accepts)
**Steps**:
1. Node B accepts latest price (465)
2. Settlement message sent via stream
3. Both parties log finalization

**Success Criteria**:
- ✅ Acceptance message delivered
- ✅ Settlement finalized on both nodes
- ✅ No deadlocks during finalization
- ✅ Demo completes successfully

---

### Scenario 6: Complete Workflow Summary
**All Scenarios Combined**:
1. ✅ Order Creation & Broadcasting (Gossipsub)
2. ✅ Order Discovery (Received from Gossipsub)
3. ✅ Negotiation Request (Direct stream)
4. ✅ Price Proposal (Direct stream)
5. ✅ Counter-Proposal (Direct stream)
6. ✅ Acceptance & Settlement (Direct stream)

**Success Criteria**:
- ✅ All 6 scenarios pass
- ✅ No deadlocks (channel-based architecture)
- ✅ Proper use of Gossipsub vs direct streams
- ✅ Bootstrap pattern prevents connection race

---

## Known Limitations & Future Work

### Current Limitations
1. **No CLI-Node Integration**: CLI commands show placeholders (need IPC/RPC to control running nodes)
2. **No Persistence**: All state lost when node stops
3. **Demo-Only Testing**: Full workflow requires running the Go demo program
4. **Local Network Only**: mDNS only works on local network (need DHT for internet-scale)

### Recommended Next Steps
1. **Implement IPC/RPC** (gRPC or HTTP API for CLI-to-node communication)
2. **Add persistent storage** (SQLite or BoltDB for orders/sessions)
3. **Wire CLI to running node** (single node process that CLI communicates with)
4. **Add Kademlia DHT** for internet-scale peer discovery (beyond local mDNS)

---

## Troubleshooting

### Issue: "noise: message is too short" error
**Cause**: Bidirectional dial race when both nodes discover each other via mDNS and dial simultaneously
**Solution**: Use bootstrap pattern - first node (port 9000) is passive, second node (port 9001+) is active

### Issue: Nodes can't connect
**Solution**:
- Verify multiaddr format: `/ip4/127.0.0.1/tcp/9000/p2p/12D3Koo...`
- Check firewall settings
- Ensure ports not already in use
- Check if mDNS discovery is working (both nodes on same local network)

### Issue: Orders not appearing on peer
**Solution**:
- Wait longer for mDNS discovery (can take 1-2 seconds)
- Check if Gossipsub topic subscription worked
- Verify order was actually broadcast (check Node A logs)
- Ensure peers are connected before broadcasting

### Issue: Demo hangs
**Cause**: Likely a deadlock in channel communication
**Solution**:
- Check Go demo code for blocking channel operations
- Ensure all goroutines have proper context cancellation
- Verify no circular dependencies in channel sends/receives

---

## Test Execution Checklist

**CLI Tests** (10 minutes):
- [ ] Test 1: Single node startup with libp2p
- [ ] Test 2: Two-node connection via multiaddr
- [ ] Test 3: Three-node network with mDNS discovery
- [ ] Test 4: CLI help commands (cobra framework)
- [ ] Test 5: Placeholder command messages

**Programmatic Tests** (5 minutes):
- [ ] Run Go demo: `cd blacktrace-go && go run examples/demo.go`
- [ ] Verify all 6 scenarios pass
- [ ] Confirm no deadlocks
- [ ] Check Gossipsub broadcasts work
- [ ] Check direct stream negotiations work

**Total Estimated Time**: 15 minutes

---

**Status**: Off-chain workflow complete (Phase 1: 7/13 components)

**Next**: After manual testing, proceed with on-chain integration (Phase 2):
- Zcash L1 RPC client + Orchard HTLC builder
- Ztarknet L2 client + Cairo HTLC interface
- Two-layer settlement coordinator
- Dual-layer blockchain monitor
