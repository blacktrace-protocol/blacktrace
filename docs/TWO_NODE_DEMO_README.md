# BlackTrace Two-Node Demo

Automated demonstration of the complete order lifecycle with two P2P-connected nodes.

## What This Demo Shows

The script demonstrates the full BlackTrace off-chain negotiation workflow with authentication:

1. ✅ **Node Startup** - Starts two independent nodes with automatic P2P connection
2. ✅ **User Authentication** - Registers and authenticates users for each node
3. ✅ **Order Creation** - Maker creates a sell order (authenticated as alice)
4. ✅ **Order Propagation** - Order broadcasts via gossipsub to all peers
5. ✅ **Proposal Submission** - Taker makes multiple price proposals (authenticated as bob)
6. ✅ **Proposal Tracking** - All proposals stored with unique IDs
7. ✅ **Proposal Review** - Maker lists and reviews all proposals
8. ✅ **Proposal Acceptance** - Maker accepts a specific proposal

## Usage

### Quick Start

```bash
./two_node_demo.sh
```

The script will:
- Build the BlackTrace binary
- Clean up any existing nodes
- Start Node A (Maker) on ports 19000 (P2P) / 8080 (API)
- Start Node B (Taker) on ports 19001 (P2P) / 8081 (API)
- Execute the complete order lifecycle
- Keep nodes running for manual inspection

Press `Ctrl+C` to stop nodes and exit.

### Expected Output

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║         BlackTrace Two-Node Demo                            ║
║         Complete Order Lifecycle                            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 1: Build BlackTrace
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Building binary...
✓ Build complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 2: Start Node A (Maker)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Starting Node A on P2P port 19000, API port 8080
✓ Node A started (PID: 12345)
✓ Peer ID: 12D3KooWSoL3jioDvYpmPvgP9DUeMjP8jy1v44tpMKf3twfKFTQP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 3: Start Node B (Taker)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Starting Node B on P2P port 19001, API port 8081
✓ Node B started (PID: 12346)
✓ Peer ID: 12D3KooWLQHHxVtNV9pBg5ptuuC79Y7FWVT3tjk2DPxMPnPBpPRS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 4: Wait for P2P Connection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Waiting for mDNS peer discovery...
✓ Nodes connected! (Node A: 1 peers, Node B: 1 peers)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 5: Authentication Setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Registering users for both nodes...
✓ User 'alice' registered on Node A (Maker)
✓ User 'bob' registered on Node B (Taker)
➜ Logging in users...
✓ Alice logged in to Node A
   Session ID: 703dceff431e156d...
✓ Bob logged in to Node B
   Session ID: 288a8407b9d4e1c7...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 6: Create Order (Node A - Maker)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Creating sell order: 10,000 ZEC at $450-$470 per ZEC (authenticated as alice)
✓ Order created: order_1763392920
   Amount: 10,000 ZEC
   Price Range: $450 - $470 per ZEC
   Total Range: $4,500,000 - $4,700,000 USDC
   Created by: alice

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 7: Verify Order Propagation (Node B)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Checking if order propagated to Node B...
✓ Order successfully propagated to Node B via gossipsub!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 8: Proposal #1 (Node B - Taker)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Taker proposes: $460 per ZEC for 10,000 ZEC (authenticated as bob)
✓ Proposal #1 sent: $460 × 10,000 = $4,600,000 USDC
   Proposed by: bob

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 9: Proposal #2 (Node B - Taker)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Taker proposes: $465 per ZEC for 10,000 ZEC (authenticated as bob)
✓ Proposal #2 sent: $465 × 10,000 = $4,650,000 USDC
   Proposed by: bob

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 10: List Proposals (Node A - Maker)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Maker reviews all proposals...
  Proposal ID: order_1763392920_proposal_1763392924463386000
  Proposal ID: order_1763392920_proposal_1763392926469929000
✓ Found proposals for order order_1763392920

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 11: Accept Proposal (Node A - Maker)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

➜ Maker accepts proposal: order_1763392920_proposal_1763392924463386000
✓ Proposal accepted! Ready for settlement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Demo Complete - Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Order Lifecycle:
  1. ✓ Users registered and authenticated
  2. ✓ Order created on Node A (Maker - alice)
  3. ✓ Order propagated to Node B (Taker) via gossipsub
  4. ✓ Taker made 2 proposals (bob)
  5. ✓ Maker reviewed proposals
  6. ✓ Maker accepted proposal

Authentication:
  Node A User: alice (Session: 703dceff431e156d...)
  Node B User: bob (Session: 288a8407b9d4e1c7...)

Network Status:
  Node A (Maker): http://localhost:8080
  Node B (Taker): http://localhost:8081
  Peer ID A: 12D3KooWSoL3jioDvYpmPvgP9DUeMjP8jy1v44tpMKf3twfKFTQP
  Peer ID B: 12D3KooWLQHHxVtNV9pBg5ptuuC79Y7FWVT3tjk2DPxMPnPBpPRS

Node Logs (Authentication):
2025/11/18 17:36:56 Auth: User alice logged in (session: 703dceff..., expires: 2025-11-19T17:36:56+05:30)
2025/11/19 18:05:08 Order order_1763392920 created by user: alice
2025/11/19 18:05:51 Proposal for order order_1763392920 created by user: bob

Next Steps:
  • Implement ECIES encryption for order details (Phase 2B)
  • Add ECDSA signatures to messages (Phase 2B)
  • Implement HTLC secret generation
  • Build Zcash L1 Orchard HTLC
  • Build Ztarknet L2 Cairo HTLC
  • Coordinate dual-layer atomic settlement

Log Files:
  Node A: /tmp/node-a.log
  Node B: /tmp/node-b.log
```

## Architecture Verified

This demo proves:

### ✅ P2P Networking
- libp2p with Noise encryption working
- mDNS automatic peer discovery functioning
- Stable bidirectional connections

### ✅ Message Propagation
- **Gossipsub**: Broadcasts order announcements and proposals to all peers
- **Direct Streams**: Used for sensitive order details (request/response pattern)

### ✅ Proposal Tracking
- Unique ProposalID generation (timestamp-based)
- Proposals stored with status (Pending/Accepted/Rejected)
- ProposerID tracked (peer who made the proposal)

### ✅ Authentication & Authorization
- User registration with encrypted ECDSA keypairs
- Session-based authentication (24-hour expiration)
- Session tokens for authenticated operations
- Username tracking for audit trails

### ✅ CLI-Node Integration
- HTTP REST API working on all endpoints
- Multiple nodes can run simultaneously on different ports
- `--api-url` flag allows targeting specific nodes
- Direct API access via curl for testing

## Manual Inspection

After the demo runs, nodes remain active for manual testing:

```bash
# Query Node A (Maker)
./blacktrace --api-url http://localhost:8080 query status
./blacktrace --api-url http://localhost:8080 order list

# Query Node B (Taker)
./blacktrace --api-url http://localhost:8081 query status
./blacktrace --api-url http://localhost:8081 query peers

# List proposals
./blacktrace --api-url http://localhost:8080 negotiate list-proposals <order-id>

# Make additional proposals
./blacktrace --api-url http://localhost:8081 negotiate propose <order-id> \
    --price 468 --amount 10000

# Accept a different proposal
./blacktrace --api-url http://localhost:8080 negotiate accept \
    --proposal-id <proposal_id>
```

## Cleanup

To stop the demo and kill all nodes:

```bash
# Press Ctrl+C (script has trap to cleanup)
# Or manually:
./blacktrace node kill-all
```

## Configuration

Edit the script to customize:

```bash
# Port configuration
NODE_A_P2P_PORT=19000    # Node A libp2p port
NODE_A_API_PORT=8080     # Node A HTTP API port
NODE_B_P2P_PORT=19001    # Node B libp2p port
NODE_B_API_PORT=8081     # Node B HTTP API port

# Timing
STEP_DELAY=2             # Delay between steps (seconds)
```

## Troubleshooting

### Issue: "Error connecting to node"
**Solution**: Wait longer for nodes to start. Increase `STEP_DELAY` or add more sleep time after node startup.

### Issue: Nodes not discovering each other
**Symptoms**: "peer_count: 0" after waiting
**Solution**:
- Ensure no firewall blocking mDNS (port 5353)
- Check logs: `/tmp/node-a.log` and `/tmp/node-b.log`
- Kill zombie processes: `./blacktrace node kill-all`

### Issue: Order not propagating
**Symptoms**: Node B doesn't see order created on Node A
**Solution**:
- Verify nodes are connected (peer_count > 0)
- Wait longer for gossipsub propagation
- Check that both nodes are on same gossipsub topic

### Issue: Proposal not showing correct status
**Symptoms**: Accepted proposal still shows "Pending"
**Solution**:
- Currently acceptance is local only (not broadcast)
- Future: Implement acceptance broadcast to network

## What's Working

✅ **Off-chain negotiation complete**
- User authentication with encrypted identities
- Authenticated order creation and broadcasting
- Multi-round proposal negotiation
- Proposal tracking with unique IDs
- Proposal acceptance
- Username logging for audit trails

## What's Next

🔄 **On-chain settlement** (not yet implemented)
- HTLC secret generation
- Zcash L1 Orchard HTLC
- Ztarknet L2 Cairo HTLC
- Dual-layer atomic settlement coordinator
- Blockchain monitors for secret reveals

---

**Last Updated**: 2025-11-19
**Status**: ✅ Fully functional off-chain workflow with authentication (Phase 2A complete)
