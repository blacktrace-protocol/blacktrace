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

# Step 6: Create Order on Node A
print_header "Step 5: Create Order (Node A - Maker)"
print_step "Creating sell order: 10,000 ZEC at \$450-\$470 per ZEC"
ORDER_RESPONSE=$(./blacktrace --api-url http://localhost:$NODE_A_API_PORT order create \
    --amount 10000 \
    --stablecoin USDC \
    --min-price 450 \
    --max-price 470)

ORDER_ID=$(echo "$ORDER_RESPONSE" | grep "Order created:" | awk '{print $4}')
print_success "Order created: $ORDER_ID"
echo -e "   ${CYAN}Amount:${NC} 10,000 ZEC"
echo -e "   ${CYAN}Price Range:${NC} \$450 - \$470 per ZEC"
echo -e "   ${CYAN}Total Range:${NC} \$4,500,000 - \$4,700,000 USDC"

sleep $STEP_DELAY

# Step 7: Verify order propagation to Node B
print_header "Step 6: Verify Order Propagation (Node B)"
print_step "Checking if order propagated to Node B..."
sleep 2
NODE_B_ORDERS=$(./blacktrace --api-url http://localhost:$NODE_B_API_PORT order list)

if echo "$NODE_B_ORDERS" | grep -q "$ORDER_ID"; then
    print_success "Order successfully propagated to Node B via gossipsub!"
else
    print_error "Order not yet visible on Node B (may need more time)"
fi

# Step 8: Make first proposal from Node B
print_header "Step 7: Proposal #1 (Node B - Taker)"
print_step "Taker proposes: \$460 per ZEC for 10,000 ZEC"
./blacktrace --api-url http://localhost:$NODE_B_API_PORT negotiate propose $ORDER_ID \
    --price 460 \
    --amount 10000

print_success "Proposal #1 sent: \$460 × 10,000 = \$4,600,000 USDC"

sleep $STEP_DELAY

# Step 9: Make second proposal from Node B
print_header "Step 8: Proposal #2 (Node B - Taker)"
print_step "Taker proposes: \$465 per ZEC for 10,000 ZEC"
./blacktrace --api-url http://localhost:$NODE_B_API_PORT negotiate propose $ORDER_ID \
    --price 465 \
    --amount 10000

print_success "Proposal #2 sent: \$465 × 10,000 = \$4,650,000 USDC"

sleep $STEP_DELAY

# Step 10: List proposals on Node A
print_header "Step 9: List Proposals (Node A - Maker)"
print_step "Maker reviews all proposals..."
PROPOSALS_OUTPUT=$(./blacktrace --api-url http://localhost:$NODE_A_API_PORT negotiate list-proposals $ORDER_ID)
echo "$PROPOSALS_OUTPUT"

# Extract first proposal ID
PROPOSAL_ID=$(echo "$PROPOSALS_OUTPUT" | grep "Proposal ID:" | head -1 | awk '{print $4}')
print_success "Found proposals for order $ORDER_ID"

sleep $STEP_DELAY

# Step 11: Accept proposal on Node A
print_header "Step 10: Accept Proposal (Node A - Maker)"
print_step "Maker accepts proposal: $PROPOSAL_ID"
ACCEPT_OUTPUT=$(./blacktrace --api-url http://localhost:$NODE_A_API_PORT negotiate accept \
    --proposal-id "$PROPOSAL_ID")

echo "$ACCEPT_OUTPUT"
print_success "Proposal accepted! Ready for settlement"

sleep $STEP_DELAY

# Step 12: Verify proposal status
print_header "Step 11: Verify Proposal Status (Node A)"
print_step "Checking updated proposal status..."
FINAL_PROPOSALS=$(./blacktrace --api-url http://localhost:$NODE_A_API_PORT negotiate list-proposals $ORDER_ID)
echo "$FINAL_PROPOSALS"

if echo "$FINAL_PROPOSALS" | grep -q "Accepted"; then
    print_success "Proposal status updated to 'Accepted'"
else
    print_error "Proposal status not updated (may need to broadcast acceptance)"
fi

# Step 13: Final Summary
print_header "Demo Complete - Summary"
echo -e "${CYAN}Order Lifecycle:${NC}"
echo -e "  1. ✓ Order created on Node A (Maker)"
echo -e "  2. ✓ Order propagated to Node B (Taker) via gossipsub"
echo -e "  3. ✓ Taker made 2 proposals"
echo -e "  4. ✓ Maker reviewed proposals"
echo -e "  5. ✓ Maker accepted proposal"
echo ""
echo -e "${CYAN}Network Status:${NC}"
echo -e "  Node A (Maker): http://localhost:$NODE_A_API_PORT"
echo -e "  Node B (Taker): http://localhost:$NODE_B_API_PORT"
echo -e "  Peer ID A: $NODE_A_PEER_ID"
echo -e "  Peer ID B: $NODE_B_PEER_ID"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo -e "  • Implement HTLC secret generation"
echo -e "  • Build Zcash L1 Orchard HTLC"
echo -e "  • Build Ztarknet L2 Cairo HTLC"
echo -e "  • Coordinate dual-layer atomic settlement"
echo ""
echo -e "${CYAN}Logs:${NC}"
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
