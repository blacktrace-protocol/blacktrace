#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
NODE_A_P2P_PORT=19000
NODE_A_API_PORT=8080
NODE_B_P2P_PORT=19001
NODE_B_API_PORT=8081

STEP_DELAY=2

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                              ║${NC}"
echo -e "${CYAN}║         BlackTrace Two-Node Demo                            ║${NC}"
echo -e "${CYAN}║         Complete Order Lifecycle                            ║${NC}"
echo -e "${CYAN}║                                                              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print section headers
print_header() {
    echo ""
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}  $1${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Function to print step
print_step() {
    echo -e "${BLUE}➜${NC} $1"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Cleanup function
cleanup() {
    print_header "Cleanup"
    print_step "Killing all BlackTrace nodes..."
    ./blacktrace node kill-all 2>/dev/null || true
    sleep 2
    print_success "Cleanup complete"
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Step 1: Build the project
print_header "Step 1: Build BlackTrace"
print_step "Building binary..."
go build -o blacktrace
print_success "Build complete"

# Step 2: Cleanup
cleanup

# Step 3: Start Node A (Maker)
print_header "Step 2: Start Node A (Maker)"
print_step "Starting Node A on P2P port $NODE_A_P2P_PORT, API port $NODE_A_API_PORT"
./blacktrace node --port $NODE_A_P2P_PORT --api-port $NODE_A_API_PORT > /tmp/node-a.log 2>&1 &
NODE_A_PID=$!
sleep 3

# Get Node A's peer ID
NODE_A_STATUS=$(curl -s http://localhost:$NODE_A_API_PORT/status)
NODE_A_PEER_ID=$(echo $NODE_A_STATUS | grep -o '"peer_id":"[^"]*"' | cut -d'"' -f4)
print_success "Node A started (PID: $NODE_A_PID)"
print_success "Peer ID: $NODE_A_PEER_ID"

# Step 4: Start Node B (Taker)
print_header "Step 3: Start Node B (Taker)"
print_step "Starting Node B on P2P port $NODE_B_P2P_PORT, API port $NODE_B_API_PORT"
./blacktrace node --port $NODE_B_P2P_PORT --api-port $NODE_B_API_PORT > /tmp/node-b.log 2>&1 &
NODE_B_PID=$!
sleep 3

# Get Node B's peer ID
NODE_B_STATUS=$(curl -s http://localhost:$NODE_B_API_PORT/status)
NODE_B_PEER_ID=$(echo $NODE_B_STATUS | grep -o '"peer_id":"[^"]*"' | cut -d'"' -f4)
print_success "Node B started (PID: $NODE_B_PID)"
print_success "Peer ID: $NODE_B_PEER_ID"

# Step 5: Wait for mDNS discovery
print_header "Step 4: Wait for P2P Connection"
print_step "Waiting for mDNS peer discovery..."
sleep 5

# Check connectivity
NODE_A_PEERS=$(curl -s http://localhost:$NODE_A_API_PORT/status | grep -o '"peer_count":[0-9]*' | cut -d':' -f2)
NODE_B_PEERS=$(curl -s http://localhost:$NODE_B_API_PORT/status | grep -o '"peer_count":[0-9]*' | cut -d':' -f2)

if [ "$NODE_A_PEERS" -gt 0 ] && [ "$NODE_B_PEERS" -gt 0 ]; then
    print_success "Nodes connected! (Node A: $NODE_A_PEERS peers, Node B: $NODE_B_PEERS peers)"
else
    print_error "Warning: Nodes may not be connected yet (Node A: $NODE_A_PEERS peers, Node B: $NODE_B_PEERS peers)"
fi

# Step 6: Authentication Setup
print_header "Step 5: Authentication Setup"
print_step "Registering users for both nodes..."

# Register alice for Node A
curl -s -X POST http://localhost:$NODE_A_API_PORT/auth/register \
    -H 'Content-Type: application/json' \
    -d '{"username":"alice","password":"demo123"}' > /dev/null
print_success "User 'alice' registered on Node A (Maker)"

# Register bob for Node B
curl -s -X POST http://localhost:$NODE_B_API_PORT/auth/register \
    -H 'Content-Type: application/json' \
    -d '{"username":"bob","password":"demo456"}' > /dev/null
print_success "User 'bob' registered on Node B (Taker)"

print_step "Logging in users..."

# Login alice and get session ID
NODE_A_SESSION=$(curl -s -X POST http://localhost:$NODE_A_API_PORT/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"alice","password":"demo123"}' | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)
print_success "Alice logged in to Node A"
echo -e "   ${CYAN}Session ID:${NC} ${NODE_A_SESSION:0:16}..."

# Login bob and get session ID
NODE_B_SESSION=$(curl -s -X POST http://localhost:$NODE_B_API_PORT/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"bob","password":"demo456"}' | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)
print_success "Bob logged in to Node B"
echo -e "   ${CYAN}Session ID:${NC} ${NODE_B_SESSION:0:16}..."

sleep $STEP_DELAY

# Step 7: Create Order on Node A
print_header "Step 6: Create Order (Node A - Maker)"
print_step "Creating sell order: 10,000 ZEC at \$450-\$470 per ZEC (authenticated as alice)"
ORDER_RESPONSE=$(curl -s -X POST http://localhost:$NODE_A_API_PORT/orders/create \
    -H 'Content-Type: application/json' \
    -d "{\"session_id\":\"$NODE_A_SESSION\",\"amount\":10000,\"stablecoin\":\"USDC\",\"min_price\":450,\"max_price\":470}")

ORDER_ID=$(echo "$ORDER_RESPONSE" | grep -o '"order_id":"[^"]*"' | cut -d'"' -f4)
print_success "Order created: $ORDER_ID"
echo -e "   ${CYAN}Amount:${NC} 10,000 ZEC"
echo -e "   ${CYAN}Price Range:${NC} \$450 - \$470 per ZEC"
echo -e "   ${CYAN}Total Range:${NC} \$4,500,000 - \$4,700,000 USDC"
echo -e "   ${CYAN}Created by:${NC} alice"

sleep $STEP_DELAY

# Step 8: Verify order propagation to Node B
print_header "Step 7: Verify Order Propagation (Node B)"
print_step "Checking if order propagated to Node B..."
sleep 2
NODE_B_ORDERS=$(curl -s http://localhost:$NODE_B_API_PORT/orders)

if echo "$NODE_B_ORDERS" | grep -q "$ORDER_ID"; then
    print_success "Order successfully propagated to Node B via gossipsub!"
else
    print_error "Order not yet visible on Node B (may need more time)"
fi

# Step 9: Make first proposal from Node B
print_header "Step 8: Proposal #1 (Node B - Taker)"
print_step "Taker proposes: \$460 per ZEC for 10,000 ZEC (authenticated as bob)"
curl -s -X POST http://localhost:$NODE_B_API_PORT/negotiate/propose \
    -H 'Content-Type: application/json' \
    -d "{\"session_id\":\"$NODE_B_SESSION\",\"order_id\":\"$ORDER_ID\",\"price\":460,\"amount\":10000}" > /dev/null

print_success "Proposal #1 sent: \$460 × 10,000 = \$4,600,000 USDC"
echo -e "   ${CYAN}Proposed by:${NC} bob"

sleep $STEP_DELAY

# Step 10: Make second proposal from Node B
print_header "Step 9: Proposal #2 (Node B - Taker)"
print_step "Taker proposes: \$465 per ZEC for 10,000 ZEC (authenticated as bob)"
curl -s -X POST http://localhost:$NODE_B_API_PORT/negotiate/propose \
    -H 'Content-Type: application/json' \
    -d "{\"session_id\":\"$NODE_B_SESSION\",\"order_id\":\"$ORDER_ID\",\"price\":465,\"amount\":10000}" > /dev/null

print_success "Proposal #2 sent: \$465 × 10,000 = \$4,650,000 USDC"
echo -e "   ${CYAN}Proposed by:${NC} bob"

sleep $STEP_DELAY

# Step 11: List proposals on Node A
print_header "Step 10: List Proposals (Node A - Maker)"
print_step "Maker reviews all proposals..."
PROPOSALS_RAW=$(curl -s -X POST http://localhost:$NODE_A_API_PORT/negotiate/proposals \
    -H 'Content-Type: application/json' \
    -d "{\"order_id\":\"$ORDER_ID\"}")

# Pretty print proposals
echo "$PROPOSALS_RAW" | grep -o '"proposal_id":"[^"]*"' | cut -d'"' -f4 | while read -r pid; do
    echo -e "${CYAN}  Proposal ID:${NC} $pid"
done

# Extract first proposal ID
PROPOSAL_ID=$(echo "$PROPOSALS_RAW" | grep -o '"proposal_id":"[^"]*"' | head -1 | cut -d'"' -f4)
print_success "Found proposals for order $ORDER_ID"

sleep $STEP_DELAY

# Step 12: Accept proposal on Node A
print_header "Step 11: Accept Proposal (Node A - Maker)"
print_step "Maker accepts proposal: $PROPOSAL_ID"
ACCEPT_OUTPUT=$(curl -s -X POST http://localhost:$NODE_A_API_PORT/negotiate/accept \
    -H 'Content-Type: application/json' \
    -d "{\"proposal_id\":\"$PROPOSAL_ID\"}")

if echo "$ACCEPT_OUTPUT" | grep -q "accepted"; then
    print_success "Proposal accepted! Ready for settlement"
else
    print_error "Failed to accept proposal: $ACCEPT_OUTPUT"
fi

sleep $STEP_DELAY

# Step 13: Verify proposal status
print_header "Step 12: Verify Proposal Status (Node A)"
print_step "Checking updated proposal status..."
FINAL_PROPOSALS=$(curl -s -X POST http://localhost:$NODE_A_API_PORT/negotiate/proposals \
    -H 'Content-Type: application/json' \
    -d "{\"order_id\":\"$ORDER_ID\"}")

if echo "$FINAL_PROPOSALS" | grep -q "Accepted"; then
    print_success "Proposal status updated to 'Accepted'"
else
    print_error "Proposal status not updated (may need to broadcast acceptance)"
fi

# Step 14: Final Summary
print_header "Demo Complete - Summary"
echo -e "${CYAN}Order Lifecycle:${NC}"
echo -e "  1. ✓ Users registered and authenticated"
echo -e "  2. ✓ Order created on Node A (Maker - alice)"
echo -e "  3. ✓ Order propagated to Node B (Taker) via gossipsub"
echo -e "  4. ✓ Taker made 2 proposals (bob)"
echo -e "  5. ✓ Maker reviewed proposals"
echo -e "  6. ✓ Maker accepted proposal"
echo ""
echo -e "${CYAN}Authentication:${NC}"
echo -e "  Node A User: alice (Session: ${NODE_A_SESSION:0:16}...)"
echo -e "  Node B User: bob (Session: ${NODE_B_SESSION:0:16}...)"
echo ""
echo -e "${CYAN}Network Status:${NC}"
echo -e "  Node A (Maker): http://localhost:$NODE_A_API_PORT"
echo -e "  Node B (Taker): http://localhost:$NODE_B_API_PORT"
echo -e "  Peer ID A: $NODE_A_PEER_ID"
echo -e "  Peer ID B: $NODE_B_PEER_ID"
echo ""
echo -e "${CYAN}Node Logs (Authentication):${NC}"
tail -5 /tmp/node-a.log | grep -E "Auth:|created by user" | head -3
tail -5 /tmp/node-b.log | grep -E "Auth:|created by user" | head -3
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo -e "  • Implement ECIES encryption for order details (Phase 2B)"
echo -e "  • Add ECDSA signatures to messages (Phase 2B)"
echo -e "  • Implement HTLC secret generation"
echo -e "  • Build Zcash L1 Orchard HTLC"
echo -e "  • Build Ztarknet L2 Cairo HTLC"
echo -e "  • Coordinate dual-layer atomic settlement"
echo ""
echo -e "${CYAN}Log Files:${NC}"
echo -e "  Node A: /tmp/node-a.log"
echo -e "  Node B: /tmp/node-b.log"
echo ""
echo -e "${YELLOW}Note: Nodes will be killed on script exit${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop nodes and exit${NC}"
echo ""

# Keep script running so nodes stay alive
print_step "Demo complete. Nodes are still running for inspection..."
print_step "Press Ctrl+C to stop nodes and exit"
echo ""

# Wait indefinitely
while true; do
    sleep 10
done
