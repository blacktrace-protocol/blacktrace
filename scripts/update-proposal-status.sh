#!/bin/bash

# Script to manually update proposal settlement status for testing

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Update Proposal Settlement Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if proposal ID is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <proposal_id>"
    echo ""
    echo "Example:"
    echo "  $0 order_1763879671_proposal_1763879719371234900"
    echo ""
    exit 1
fi

PROPOSAL_ID="$1"

echo "Proposal ID: $PROPOSAL_ID"
echo ""

# Show available statuses
echo "Available settlement statuses:"
echo "  1) ready           - Ready for Alice to lock ZEC"
echo "  2) alice_locked    - Alice has locked ZEC, waiting for Bob"
echo "  3) both_locked     - Both assets locked, ready for claiming"
echo "  4) completed       - Settlement completed"
echo ""

# Ask for new status
read -p "Enter the number for the new status (1-4): " choice

case $choice in
    1)
        NEW_STATUS="ready"
        ;;
    2)
        NEW_STATUS="alice_locked"
        ;;
    3)
        NEW_STATUS="both_locked"
        ;;
    4)
        NEW_STATUS="completed"
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Updating proposal status..."
echo "  Proposal: $PROPOSAL_ID"
echo "  New Status: $NEW_STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Extract order ID from proposal ID (format: order_XXX_proposal_YYY)
ORDER_ID=$(echo "$PROPOSAL_ID" | sed 's/_proposal_.*//')

echo "Extracted Order ID: $ORDER_ID"
echo ""

# Update proposal status in both Alice and Bob nodes
echo "Updating Alice's node..."
ALICE_RESPONSE=$(curl -s -X POST "http://localhost:8080/settlement/update-status" \
  -H "Content-Type: application/json" \
  -d "{\"proposal_id\": \"$PROPOSAL_ID\", \"settlement_status\": \"$NEW_STATUS\"}")

if echo "$ALICE_RESPONSE" | grep -q "success.*true"; then
    echo "✓ Alice's node updated successfully"
    echo "$ALICE_RESPONSE" | jq '.' 2>/dev/null || echo "$ALICE_RESPONSE"
else
    echo "⚠ Failed to update Alice's node"
    echo "$ALICE_RESPONSE"
fi

echo ""
echo "Updating Bob's node..."
BOB_RESPONSE=$(curl -s -X POST "http://localhost:8081/settlement/update-status" \
  -H "Content-Type: application/json" \
  -d "{\"proposal_id\": \"$PROPOSAL_ID\", \"settlement_status\": \"$NEW_STATUS\"}")

if echo "$BOB_RESPONSE" | grep -q "success.*true"; then
    echo "✓ Bob's node updated successfully"
    echo "$BOB_RESPONSE" | jq '.' 2>/dev/null || echo "$BOB_RESPONSE"
else
    echo "⚠ Failed to update Bob's node"
    echo "$BOB_RESPONSE"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Update complete!"
echo ""
echo "💡 TIP: Refresh the frontend to see the updated status."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
