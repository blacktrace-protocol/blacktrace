#!/bin/bash

# BlackTrace Platform API Test Suite
# Tests complete workflow: Registration → Wallet → Order → Proposal → Settlement

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# API endpoints
MAKER_API="http://localhost:8080"
TAKER_API="http://localhost:8081"
SETTLEMENT_API="http://localhost:8090"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_test() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}TEST: $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
    ((TESTS_PASSED++))
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
    ((TESTS_FAILED++))
}

print_info() {
    echo -e "${YELLOW}→ $1${NC}"
}

# Extract JSON field
extract_json_field() {
    echo "$1" | grep -o "\"$2\":\"[^\"]*\"" | cut -d'"' -f4
}

extract_json_number() {
    echo "$1" | grep -o "\"$2\":[0-9.]*" | cut -d':' -f2
}

# Start tests
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         BlackTrace Platform API Test Suite              ║"
echo "╔══════════════════════════════════════════════════════════╗"
echo -e "${NC}"

# ============================================================================
# 1. AUTHENTICATION & USER MANAGEMENT
# ============================================================================

print_test "1.1 Register Alice (Maker)"
RESPONSE=$(curl -s -X POST "$MAKER_API/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "password": "test123"
  }')
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "registered"; then
    print_success "Alice registered successfully"
else
    print_error "Failed to register Alice"
fi

print_test "1.2 Register Bob (Taker)"
RESPONSE=$(curl -s -X POST "$TAKER_API/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "bob",
    "password": "test123"
  }')
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "registered"; then
    print_success "Bob registered successfully"
else
    print_error "Failed to register Bob"
fi

print_test "1.3 Login Alice"
RESPONSE=$(curl -s -X POST "$MAKER_API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "password": "test123"
  }')
echo "$RESPONSE" | jq .
ALICE_SESSION=$(extract_json_field "$RESPONSE" "session_id")
if [ -n "$ALICE_SESSION" ]; then
    print_success "Alice logged in (session: ${ALICE_SESSION:0:16}...)"
else
    print_error "Failed to login Alice"
    exit 1
fi

print_test "1.4 Login Bob"
RESPONSE=$(curl -s -X POST "$TAKER_API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "bob",
    "password": "test123"
  }')
echo "$RESPONSE" | jq .
BOB_SESSION=$(extract_json_field "$RESPONSE" "session_id")
if [ -n "$BOB_SESSION" ]; then
    print_success "Bob logged in (session: ${BOB_SESSION:0:16}...)"
else
    print_error "Failed to login Bob"
    exit 1
fi

print_test "1.5 Whoami - Alice"
RESPONSE=$(curl -s -X POST "$MAKER_API/auth/whoami" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$ALICE_SESSION\"
  }")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "alice"; then
    print_success "Alice session validated"
else
    print_error "Failed to validate Alice session"
fi

# ============================================================================
# 2. WALLET MANAGEMENT
# ============================================================================

print_test "2.1 Create Zcash Wallet for Alice"
RESPONSE=$(curl -s -X POST "$MAKER_API/wallet/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$ALICE_SESSION\",
    \"chain\": \"zcash\"
  }")
echo "$RESPONSE" | jq .
ALICE_ZEC_ADDR=$(extract_json_field "$RESPONSE" "address")
if [ -n "$ALICE_ZEC_ADDR" ]; then
    print_success "Alice Zcash wallet created: $ALICE_ZEC_ADDR"
else
    print_error "Failed to create Alice Zcash wallet"
fi

print_test "2.2 Fund Alice's Wallet"
RESPONSE=$(curl -s -X POST "$MAKER_API/wallet/fund" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$ALICE_SESSION\",
    \"chain\": \"zcash\",
    \"amount\": 2000.0
  }")
echo "$RESPONSE" | jq .
ALICE_TXID=$(extract_json_field "$RESPONSE" "txid")
if [ -n "$ALICE_TXID" ]; then
    print_success "Alice wallet funded (txid: ${ALICE_TXID:0:16}...)"
else
    print_error "Failed to fund Alice wallet"
fi

# Wait for mining
print_info "Waiting 3 seconds for transaction to confirm..."
sleep 3

print_test "2.3 Get Alice's Wallet Info"
RESPONSE=$(curl -s "$MAKER_API/wallet/info?username=alice&chain=zcash")
echo "$RESPONSE" | jq .
ALICE_BALANCE=$(extract_json_number "$RESPONSE" "balance")
if [ -n "$ALICE_BALANCE" ]; then
    print_success "Alice balance: $ALICE_BALANCE ZEC"
else
    print_error "Failed to get Alice wallet info"
fi

print_test "2.4 Create Zcash Wallet for Bob"
RESPONSE=$(curl -s -X POST "$TAKER_API/wallet/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$BOB_SESSION\",
    \"chain\": \"zcash\"
  }")
echo "$RESPONSE" | jq .
BOB_ZEC_ADDR=$(extract_json_field "$RESPONSE" "address")
if [ -n "$BOB_ZEC_ADDR" ]; then
    print_success "Bob Zcash wallet created: $BOB_ZEC_ADDR"
else
    print_error "Failed to create Bob Zcash wallet"
fi

print_test "2.5 Fund Bob's Wallet"
RESPONSE=$(curl -s -X POST "$TAKER_API/wallet/fund" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$BOB_SESSION\",
    \"chain\": \"zcash\",
    \"amount\": 100.0
  }")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "success"; then
    print_success "Bob wallet funded"
else
    print_error "Failed to fund Bob wallet"
fi

# ============================================================================
# 3. ORDER MANAGEMENT
# ============================================================================

print_test "3.1 Alice Creates Order (Sell 100 ZEC for STRK)"
RESPONSE=$(curl -s -X POST "$MAKER_API/orders/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$ALICE_SESSION\",
    \"maker_chain\": \"zcash\",
    \"maker_asset\": \"ZEC\",
    \"amount\": 10000,
    \"taker_chain\": \"starknet\",
    \"taker_asset\": \"STRK\",
    \"min_price\": 25.0,
    \"max_price\": 30.0
  }")
echo "$RESPONSE" | jq .
ORDER_ID=$(extract_json_field "$RESPONSE" "order_id")
if [ -n "$ORDER_ID" ]; then
    print_success "Order created: $ORDER_ID"
else
    print_error "Failed to create order"
    exit 1
fi

# Wait for P2P propagation
print_info "Waiting 2 seconds for P2P propagation..."
sleep 2

print_test "3.2 Bob Lists Available Orders"
RESPONSE=$(curl -s "$TAKER_API/orders?session_id=$BOB_SESSION")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "$ORDER_ID"; then
    print_success "Bob can see Alice's order"
else
    print_error "Bob cannot see Alice's order"
fi

print_test "3.3 Bob Gets Order Details"
RESPONSE=$(curl -s "$TAKER_API/orders/$ORDER_ID?session_id=$BOB_SESSION")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "$ORDER_ID"; then
    print_success "Order details retrieved"
else
    print_error "Failed to get order details"
fi

# ============================================================================
# 4. PROPOSAL LIFECYCLE
# ============================================================================

print_test "4.1 Bob Creates Proposal (27.5 STRK per ZEC)"
RESPONSE=$(curl -s -X POST "$TAKER_API/orders/$ORDER_ID/propose" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$BOB_SESSION\",
    \"price\": 27.5,
    \"amount\": 10000
  }")
echo "$RESPONSE" | jq .
PROPOSAL_ID=$(extract_json_field "$RESPONSE" "proposal_id")
if [ -n "$PROPOSAL_ID" ]; then
    print_success "Proposal created: $PROPOSAL_ID"
else
    print_error "Failed to create proposal"
    exit 1
fi

# Wait for P2P propagation
print_info "Waiting 2 seconds for P2P propagation..."
sleep 2

print_test "4.2 Alice Lists Incoming Proposals"
RESPONSE=$(curl -s "$MAKER_API/proposals?session_id=$ALICE_SESSION")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "$PROPOSAL_ID"; then
    print_success "Alice can see Bob's proposal"
else
    print_error "Alice cannot see Bob's proposal"
fi

print_test "4.3 Alice Gets Proposal Details"
RESPONSE=$(curl -s "$MAKER_API/proposals/$PROPOSAL_ID?session_id=$ALICE_SESSION")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "pending"; then
    print_success "Proposal is in pending state"
else
    print_error "Proposal is not in correct state"
fi

print_test "4.4 Alice Accepts Proposal"
RESPONSE=$(curl -s -X POST "$MAKER_API/proposals/$PROPOSAL_ID/accept" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$ALICE_SESSION\"
  }")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "accepted"; then
    print_success "Proposal accepted"
else
    print_error "Failed to accept proposal"
fi

# Wait for status sync
print_info "Waiting 2 seconds for status sync..."
sleep 2

# ============================================================================
# 5. SETTLEMENT & HTLC
# ============================================================================

print_test "5.1 Check Settlement Queue for Alice"
RESPONSE=$(curl -s "$SETTLEMENT_API/settlement/queue?username=alice")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "$PROPOSAL_ID"; then
    print_success "Settlement appears in Alice's queue"
else
    print_error "Settlement not in Alice's queue"
fi

print_test "5.2 Alice Locks ZEC in HTLC"
RESPONSE=$(curl -s -X POST "$MAKER_API/settlement/$PROPOSAL_ID/lock-zec" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$ALICE_SESSION\"
  }")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "locked" || echo "$RESPONSE" | grep -q "alice_locked"; then
    print_success "Alice locked ZEC"
else
    print_error "Failed to lock ZEC"
fi

print_info "Waiting 3 seconds for HTLC confirmation..."
sleep 3

print_test "5.3 Check Settlement Queue for Bob"
RESPONSE=$(curl -s "$SETTLEMENT_API/settlement/queue?username=bob")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "$PROPOSAL_ID"; then
    print_success "Settlement appears in Bob's queue"
else
    print_error "Settlement not in Bob's queue"
fi

print_test "5.4 Bob Locks STRK in HTLC"
print_info "Note: This would call Starknet HTLC contract"
print_info "Simulated for demo - actual Starknet integration needed"
# This would be: POST $TAKER_API/settlement/$PROPOSAL_ID/lock-strk

print_test "5.5 Get Settlement Status"
RESPONSE=$(curl -s "$SETTLEMENT_API/settlement/$PROPOSAL_ID/status")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "settlement_status"; then
    print_success "Settlement status retrieved"
else
    print_error "Failed to get settlement status"
fi

# ============================================================================
# 6. CLEANUP TESTS
# ============================================================================

print_test "6.1 Alice Logout"
RESPONSE=$(curl -s -X POST "$MAKER_API/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$ALICE_SESSION\"
  }")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "logged_out"; then
    print_success "Alice logged out"
else
    print_error "Failed to logout Alice"
fi

print_test "6.2 Bob Logout"
RESPONSE=$(curl -s -X POST "$TAKER_API/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$BOB_SESSION\"
  }")
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | grep -q "logged_out"; then
    print_success "Bob logged out"
else
    print_error "Failed to logout Bob"
fi

# ============================================================================
# TEST SUMMARY
# ============================================================================

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    TEST SUMMARY                          ║${NC}"
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}  Tests Failed: $TESTS_FAILED${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed!${NC}\n"
    exit 0
else
    echo -e "\n${RED}✗ Some tests failed${NC}\n"
    exit 1
fi
