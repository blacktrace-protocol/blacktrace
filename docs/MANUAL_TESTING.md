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
# Terminal 1
cargo run -- node --port 9000
```

**Expected Output:**
```
INFO blacktrace: Starting BlackTrace node on port 9000
INFO blacktrace: Node running. Press Ctrl+C to stop.
```

**Verification:**
- No errors or panics
- Process stays running
- Port 9000 is listening (verify with `lsof -i :9000`)

**Result**: ✅ / ❌

---

### Test 2: Two Nodes with Peer Connection

**Objective**: Verify two nodes can connect to each other.

**Steps:**
```bash
# Terminal 1 - Start first node
cargo run -- node --port 9000

# Terminal 2 - Start second node and connect to first
cargo run -- node --port 9001 --connect 127.0.0.1:9000
```

**Expected Output (Terminal 1):**
```
INFO blacktrace: Starting BlackTrace node on port 9000
INFO blacktrace: Node running. Press Ctrl+C to stop.
INFO blacktrace::p2p::network_manager: Peer connected: peer_<id>
```

**Expected Output (Terminal 2):**
```
INFO blacktrace: Starting BlackTrace node on port 9001
INFO blacktrace: Connecting to peer: 127.0.0.1:9000
INFO blacktrace: Node running. Press Ctrl+C to stop.
INFO blacktrace::p2p::network_manager: Peer connected: peer_<id>
```

**Verification:**
- Both nodes show "Peer connected" messages
- Both nodes stay running
- No connection errors

**Result**: ✅ / ❌

---

### Test 3: Three-Node Network

**Objective**: Verify multiple peers can connect in a network.

**Steps:**
```bash
# Terminal 1 - Node A (hub)
cargo run -- node --port 9000

# Terminal 2 - Node B connects to A
cargo run -- node --port 9001 --connect 127.0.0.1:9000

# Terminal 3 - Node C connects to A
cargo run -- node --port 9002 --connect 127.0.0.1:9000
```

**Expected Behavior:**
- Node A sees 2 peer connections
- Nodes B and C each see 1 peer connection
- All nodes stay running

**Verification:**
- Check logs for "Peer connected" messages
- Count should match expected connections

**Result**: ✅ / ❌

---

### Test 4: CLI Help and Commands

**Objective**: Verify CLI help and command structure.

**Steps:**
```bash
# Show main help
cargo run -- --help

# Show node command help
cargo run -- node --help

# Show order command help
cargo run -- order --help

# Show negotiate command help
cargo run -- negotiate --help

# Show query command help
cargo run -- query --help
```

**Expected Output:**
- Clean help text for each command
- No errors or panics
- All subcommands listed correctly

**Result**: ✅ / ❌

---

### Test 5: Placeholder Commands

**Objective**: Verify placeholder commands show appropriate messages.

**Steps:**
```bash
# Try creating an order (should show placeholder message)
cargo run -- order create --amount 10000 --stablecoin USDC --min-price 450 --max-price 470

# Try listing orders
cargo run -- order list

# Try requesting negotiation
cargo run -- negotiate request ORDER_ID_123

# Try querying peers
cargo run -- query peers
```

**Expected Output:**
- Each command shows an error: "Order/Negotiate/Query commands require a running node"
- Each command shows: "Future: These commands will communicate with a running node via IPC"
- Shows what the command would do (e.g., "Would create order: 10000 ZEC for USDC")

**Result**: ✅ / ❌

---

## Part 2: Programmatic Testing (Full Workflow)

Since the CLI doesn't yet have IPC, we need to test the full workflow programmatically.

### Option A: Create Interactive Demo Program

Create `examples/two_node_demo.rs`:

```rust
//! Two-node demo: Full order creation and negotiation workflow

use blacktrace::cli::BlackTraceApp;
use blacktrace::types::{OrderID, StablecoinType};
use std::time::Duration;
use tokio::time::sleep;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    println!("\n=== BlackTrace Two-Node Demo ===\n");

    // Start Node A (Maker)
    println!("Starting Node A (Maker) on port 9000...");
    let node_a = BlackTraceApp::new(9000).await?;

    // Start Node B (Taker) on a background task
    println!("Starting Node B (Taker) on port 9001...");
    let node_b = BlackTraceApp::new(9001).await?;

    // Connect Node B to Node A
    println!("\nConnecting Node B to Node A...");
    node_b.connect_to_peer("127.0.0.1:9000").await?;

    sleep(Duration::from_millis(500)).await;

    // Node A creates an order
    println!("\n--- Scenario 1: Order Creation ---");
    println!("Node A creating sell order: 10,000 ZEC for USDC (min: 450, max: 470)");
    let order_id = node_a.create_order(
        10000,
        StablecoinType::USDC,
        450,
        470
    ).await?;
    println!("✅ Order created: {}", order_id);

    sleep(Duration::from_millis(500)).await;

    // Node B lists orders
    println!("\n--- Scenario 2: Order Discovery ---");
    println!("Node B listing all orders...");
    let orders_b = node_b.list_orders().await;
    println!("✅ Node B sees {} orders", orders_b.len());
    for order in &orders_b {
        println!("   - Order {}: {} {:?}",
            order.order_id,
            order.order_type,
            order.stablecoin
        );
    }

    sleep(Duration::from_millis(500)).await;

    // Node B requests order details
    println!("\n--- Scenario 3: Negotiation Initiation ---");
    println!("Node B requesting details for order: {}", order_id);
    node_b.request_order_details(&order_id).await?;
    println!("✅ Details requested");

    sleep(Duration::from_millis(500)).await;

    // Node B proposes a price
    println!("\n--- Scenario 4: Price Proposal ---");
    println!("Node B proposing: 450 USDC per ZEC, amount: 10000");
    node_b.propose_price(&order_id, 450, 10000).await?;
    println!("✅ Proposal sent");

    sleep(Duration::from_millis(500)).await;

    // Node A counter-proposes
    println!("\n--- Scenario 5: Counter-Proposal ---");
    println!("Node A counter-proposing: 465 USDC per ZEC");
    node_a.propose_price(&order_id, 465, 10000).await?;
    println!("✅ Counter-proposal sent");

    sleep(Duration::from_millis(500)).await;

    // Node B accepts
    println!("\n--- Scenario 6: Acceptance ---");
    println!("Node B accepting final terms...");
    node_b.accept_terms(&order_id).await?;
    println!("✅ Terms accepted and finalized");

    sleep(Duration::from_millis(500)).await;

    // Query negotiation status
    println!("\n--- Scenario 7: Query Status ---");
    if let Some(status) = node_a.get_negotiation_status(&order_id).await {
        println!("Negotiation status:\n{}", status);
    }

    println!("\n=== Demo Complete ===\n");
    println!("Summary:");
    println!("✅ Order created and broadcast");
    println!("✅ Order discovered by peer");
    println!("✅ Multi-round negotiation completed");
    println!("✅ Settlement terms finalized");

    Ok(())
}
```

**To run:**
```bash
cargo run --example two_node_demo
```

**Expected Output:**
```
=== BlackTrace Two-Node Demo ===

Starting Node A (Maker) on port 9000...
Starting Node B (Taker) on port 9001...
Connecting Node B to Node A...

--- Scenario 1: Order Creation ---
Node A creating sell order: 10,000 ZEC for USDC (min: 450, max: 470)
✅ Order created: order_<timestamp>

--- Scenario 2: Order Discovery ---
Node B listing all orders...
✅ Node B sees 1 orders
   - Order order_<timestamp>: Sell USDC

--- Scenario 3: Negotiation Initiation ---
Node B requesting details for order: order_<timestamp>
✅ Details requested

--- Scenario 4: Price Proposal ---
Node B proposing: 450 USDC per ZEC, amount: 10000
✅ Proposal sent

--- Scenario 5: Counter-Proposal ---
Node A counter-proposing: 465 USDC per ZEC
✅ Counter-proposal sent

--- Scenario 6: Acceptance ---
Node B accepting final terms...
✅ Terms accepted and finalized

--- Scenario 7: Query Status ---
Negotiation status:
Order: order_<timestamp>
Role: Maker
Counterparty: peer_<id>
Proposals: 2
Latest Price: Some(465)
Complete: true

=== Demo Complete ===

Summary:
✅ Order created and broadcast
✅ Order discovered by peer
✅ Multi-round negotiation completed
✅ Settlement terms finalized
```

**Verification Checklist:**
- [ ] No panics or errors
- [ ] Order successfully created
- [ ] Order received by peer
- [ ] Negotiation messages exchanged
- [ ] Settlement terms finalized
- [ ] All status queries work

---

### Option B: Integration Test

Create `tests/e2e_offchain.rs`:

```rust
//! End-to-end off-chain workflow integration test

use blacktrace::cli::BlackTraceApp;
use blacktrace::types::StablecoinType;
use std::time::Duration;
use tokio::time::sleep;

#[tokio::test]
async fn test_two_node_order_workflow() {
    // Start two nodes
    let node_a = BlackTraceApp::new(19000).await.unwrap();
    let node_b = BlackTraceApp::new(19001).await.unwrap();

    // Connect nodes
    node_b.connect_to_peer("127.0.0.1:19000").await.unwrap();
    sleep(Duration::from_millis(200)).await;

    // Node A creates order
    let order_id = node_a.create_order(10000, StablecoinType::USDC, 450, 470)
        .await
        .unwrap();
    sleep(Duration::from_millis(200)).await;

    // Node B should see the order
    let orders = node_b.list_orders().await;
    assert_eq!(orders.len(), 1, "Node B should see 1 order");
    assert_eq!(orders[0].order_id, order_id);

    // Test negotiation flow
    node_b.request_order_details(&order_id).await.unwrap();
    sleep(Duration::from_millis(200)).await;

    node_b.propose_price(&order_id, 450, 10000).await.unwrap();
    sleep(Duration::from_millis(200)).await;

    node_a.propose_price(&order_id, 465, 10000).await.unwrap();
    sleep(Duration::from_millis(200)).await;

    node_b.accept_terms(&order_id).await.unwrap();
    sleep(Duration::from_millis(200)).await;

    // Verify negotiation complete
    let status = node_a.get_negotiation_status(&order_id).await;
    assert!(status.is_some(), "Negotiation status should exist");
    assert!(status.unwrap().contains("Complete: true"));
}

#[tokio::test]
async fn test_three_node_network() {
    // Test that orders propagate in a 3-node network
    let node_a = BlackTraceApp::new(19100).await.unwrap();
    let node_b = BlackTraceApp::new(19101).await.unwrap();
    let node_c = BlackTraceApp::new(19102).await.unwrap();

    // Connect: A <- B, A <- C
    node_b.connect_to_peer("127.0.0.1:19100").await.unwrap();
    node_c.connect_to_peer("127.0.0.1:19100").await.unwrap();
    sleep(Duration::from_millis(200)).await;

    // Node A creates order
    let order_id = node_a.create_order(5000, StablecoinType::USDT, 460, 480)
        .await
        .unwrap();
    sleep(Duration::from_millis(300)).await;

    // Both B and C should see it
    let orders_b = node_b.list_orders().await;
    let orders_c = node_c.list_orders().await;

    assert_eq!(orders_b.len(), 1, "Node B should see 1 order");
    assert_eq!(orders_c.len(), 1, "Node C should see 1 order");
    assert_eq!(orders_b[0].order_id, order_id);
    assert_eq!(orders_c[0].order_id, order_id);
}
```

**To run:**
```bash
cargo test --test e2e_offchain
```

**Expected Output:**
```
running 2 tests
test test_two_node_order_workflow ... ok
test test_three_node_network ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured
```

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
1. Node B proposes: 450 USDC per ZEC
2. Node A counter-proposes: 465 USDC per ZEC
3. Multiple rounds possible

**Success Criteria**:
- ✅ Each proposal stored in session
- ✅ State transitions to PriceDiscovery
- ✅ Proposal count increments
- ✅ Latest price updates correctly

---

### Scenario 5: Negotiation - Acceptance & Finalization
**Actors**: Node B (accepts)
**Steps**:
1. Node B accepts latest price (465)
2. Settlement terms generated
3. Both parties sign terms

**Success Criteria**:
- ✅ Settlement terms created
- ✅ Signatures generated (simplified)
- ✅ State transitions to TermsAgreed
- ✅ Session marked complete

---

### Scenario 6: Query Negotiation Status
**Actors**: Either node
**Steps**:
1. Query negotiation status for order
2. Display role, counterparty, proposals, completion

**Success Criteria**:
- ✅ Status string returned
- ✅ Shows correct role (Maker/Taker)
- ✅ Shows counterparty peer ID
- ✅ Shows proposal count and latest price
- ✅ Shows completion status

---

## Known Limitations & Future Work

### Current Limitations
1. **No IPC/RPC**: CLI commands can't control running nodes yet
2. **No Persistence**: All state lost when node stops
3. **No Event Loop Integration**: Order/negotiate commands don't trigger in running nodes
4. **Manual Timing**: Need sleep() between operations in tests

### Recommended Next Steps
1. **Implement IPC** (Unix sockets or HTTP API)
2. **Add persistent storage** (SQLite for orders/sessions)
3. **Create interactive REPL** for easier manual testing
4. **Add real-time status updates** in node event loop

---

## Troubleshooting

### Issue: Nodes can't connect
**Solution**: Check firewall, verify port not in use, ensure correct IP address

### Issue: Orders not appearing on peer
**Solution**: Increase sleep duration, check event loop processing, verify broadcast worked

### Issue: Negotiation fails
**Solution**: Check logs for errors, verify order exists, ensure peers connected

### Issue: Tests hang
**Solution**: Reduce sleep times, check for deadlocks, verify event loop running

---

## Test Execution Checklist

**CLI Tests** (15 minutes):
- [ ] Test 1: Single node startup
- [ ] Test 2: Two-node connection
- [ ] Test 3: Three-node network
- [ ] Test 4: CLI help commands
- [ ] Test 5: Placeholder command messages

**Programmatic Tests** (30 minutes):
- [ ] Create `examples/two_node_demo.rs`
- [ ] Run demo, verify all scenarios pass
- [ ] Create `tests/e2e_offchain.rs`
- [ ] Run integration tests
- [ ] Document any failures or issues

**Total Estimated Time**: 45 minutes

---

**Next**: After manual testing, document findings and proceed with on-chain integration (Zcash L1 RPC client).
