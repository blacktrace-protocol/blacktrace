#!/bin/bash
# Basic HTLC contract test script

CONTRACT_ADDR="0x0305b946a388e416709b20b49b4919de92bebbf363b23887e1d14da4593d6204"
ACCOUNT="devnet-account0"
RPC_URL="http://localhost:5050"
SNCAST="/Users/prabhueshwarla/.local/bin/sncast"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 STARKNET HTLC CONTRACT TEST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Contract Address: $CONTRACT_ADDR"
echo ""

# Test 1: Check initial state
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test 1: Get initial HTLC details"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
$SNCAST -a $ACCOUNT call \
    --contract-address $CONTRACT_ADDR \
    --function get_htlc_details \
    --url $RPC_URL

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 Test 2: Lock STRK in HTLC"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Generate a secret (simple felt252 value)
SECRET="0x1234567890abcdef"
echo "Secret: $SECRET"

# Compute hash_lock using Pedersen hash (secret, 0)
# For testing, we'll use a pre-computed hash
# In production, compute this properly
HASH_LOCK="0x04d5e2a36b64ec3e4b39e79b6a6ec1f3a2e3c1e8b5f9a2c1e8d5b9f2a3c1e8d5"
echo "Hash Lock: $HASH_LOCK"

# Receiver address (use account 1 from devnet)
RECEIVER="0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1"
echo "Receiver: $RECEIVER"

# Timeout (current timestamp + 3600 seconds)
TIMEOUT=$(($(date +%s) + 3600))
echo "Timeout: $TIMEOUT"

# Amount (1000 STRK in smallest unit = 1000 * 10^18)
# For felt252, we'll use a smaller amount: 1000
AMOUNT="1000"
echo "Amount: $AMOUNT"
echo ""

# Call lock function
echo "Calling lock()..."
$SNCAST -a $ACCOUNT invoke \
    --contract-address $CONTRACT_ADDR \
    --function lock \
    --calldata $HASH_LOCK $RECEIVER $TIMEOUT $AMOUNT 0 \
    --url $RPC_URL

echo "Waiting for transaction to be mined..."
sleep 3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test 3: Get HTLC details after lock"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
$SNCAST -a $ACCOUNT call \
    --contract-address $CONTRACT_ADDR \
    --function get_htlc_details \
    --url $RPC_URL

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Tests completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps to manually test:"
echo "  1. Claim with correct secret using receiver account"
echo "  2. Try to refund (should fail before timeout)"
echo "  3. Wait for timeout and try refund with sender account"
echo ""
