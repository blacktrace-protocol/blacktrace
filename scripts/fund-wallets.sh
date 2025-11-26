#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💰 Funding Alice and Bob's Wallets"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get Alice and Bob's addresses from the settlement service
ALICE_DATA=$(curl -s http://localhost:8090/api/alice/balance)
BOB_DATA=$(curl -s http://localhost:8090/api/bob/balance)

ALICE_ADDR=$(echo "$ALICE_DATA" | jq -r '.address')
BOB_ADDR=$(echo "$BOB_DATA" | jq -r '.address')

echo "Alice's address: $ALICE_ADDR"
echo "Bob's address:   $BOB_ADDR"
echo ""

# Zcash RPC credentials
RPC_USER="user"
RPC_PASSWORD="pass"
RPC_URL="http://localhost:18232"

# Get current wallet balance
echo "Getting current wallet balance..."
BALANCE=$(curl -s -u "$RPC_USER:$RPC_PASSWORD" \
  --data-binary '{"jsonrpc":"1.0","id":"fund","method":"getbalance","params":[]}' \
  -H 'content-type: text/plain;' \
  "$RPC_URL" | jq -r '.result')

echo "Main wallet balance: $BALANCE ZEC"
echo ""

# Mine more blocks if needed
if (( $(echo "$BALANCE < 2200" | bc -l) )); then
  echo "⛏️  Mining 200 blocks to build up balance..."
  curl -s -u "$RPC_USER:$RPC_PASSWORD" \
    --data-binary '{"jsonrpc":"1.0","id":"fund","method":"generate","params":[200]}' \
    -H 'content-type: text/plain;' \
    "$RPC_URL" > /dev/null

  echo "⛏️  Mining 100 more blocks to mature coinbase..."
  curl -s -u "$RPC_USER:$RPC_PASSWORD" \
    --data-binary '{"jsonrpc":"1.0","id":"fund","method":"generate","params":[100]}' \
    -H 'content-type: text/plain;' \
    "$RPC_URL" > /dev/null

  BALANCE=$(curl -s -u "$RPC_USER:$RPC_PASSWORD" \
    --data-binary '{"jsonrpc":"1.0","id":"fund","method":"getbalance","params":[]}' \
    -H 'content-type: text/plain;' \
    "$RPC_URL" | jq -r '.result')

  echo "✓ Updated balance: $BALANCE ZEC"
  echo ""
fi

# Fund Alice with 2000 ZEC
echo "💸 Funding Alice with 2000 ZEC..."
ALICE_TXID=$(curl -s -u "$RPC_USER:$RPC_PASSWORD" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"fund\",\"method\":\"sendtoaddress\",\"params\":[\"$ALICE_ADDR\",2000.0]}" \
  -H 'content-type: text/plain;' \
  "$RPC_URL" | jq -r '.result')

if [ "$ALICE_TXID" != "null" ] && [ -n "$ALICE_TXID" ]; then
  echo "✓ Sent 2000 ZEC to Alice (txid: ${ALICE_TXID:0:16}...)"
else
  echo "⚠ Failed to fund Alice"
fi

# Fund Bob with 100 ZEC
echo "💸 Funding Bob with 100 ZEC..."
BOB_TXID=$(curl -s -u "$RPC_USER:$RPC_PASSWORD" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"fund\",\"method\":\"sendtoaddress\",\"params\":[\"$BOB_ADDR\",100.0]}" \
  -H 'content-type: text/plain;' \
  "$RPC_URL" | jq -r '.result')

if [ "$BOB_TXID" != "null" ] && [ -n "$BOB_TXID" ]; then
  echo "✓ Sent 100 ZEC to Bob (txid: ${BOB_TXID:0:16}...)"
else
  echo "⚠ Failed to fund Bob"
fi

# Mine a block to confirm
echo ""
echo "⛏️  Mining 1 block to confirm transactions..."
curl -s -u "$RPC_USER:$RPC_PASSWORD" \
  --data-binary '{"jsonrpc":"1.0","id":"fund","method":"generate","params":[1]}' \
  -H 'content-type: text/plain;' \
  "$RPC_URL" > /dev/null

echo "✓ Transactions confirmed"
echo ""

# Check balances
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Final Balances:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Use listunspent to check transparent address balances
ALICE_BALANCE=$(curl -s -u "$RPC_USER:$RPC_PASSWORD" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"fund\",\"method\":\"listunspent\",\"params\":[1,9999999,[\"$ALICE_ADDR\"]]}" \
  -H 'content-type: text/plain;' \
  "$RPC_URL" | jq '[.result[].amount] | add // 0')

BOB_BALANCE=$(curl -s -u "$RPC_USER:$RPC_PASSWORD" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"fund\",\"method\":\"listunspent\",\"params\":[1,9999999,[\"$BOB_ADDR\"]]}" \
  -H 'content-type: text/plain;' \
  "$RPC_URL" | jq '[.result[].amount] | add // 0')

echo "Alice: $ALICE_BALANCE ZEC"
echo "Bob:   $BOB_BALANCE ZEC"
echo ""
echo "✅ Wallet funding complete!"
echo "💡 Refresh the frontend to see updated balances"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
