#!/bin/bash
# Clear Proposals Script
# Restarts backend nodes to clear in-memory proposals without touching blockchain nodes

echo "========================================"
echo "Clear Proposals - Restart Backend Nodes"
echo "========================================"
echo ""

echo "This will restart:"
echo "  - blacktrace-maker (Alice's node)"
echo "  - blacktrace-taker (Bob's node)"
echo "  - blacktrace-settlement (Settlement service)"
echo ""
echo "This will NOT restart:"
echo "  - blacktrace-zcash-regtest (Zcash blockchain)"
echo "  - blacktrace-starknet-devnet (Starknet blockchain)"
echo "  - blacktrace-nats (Message queue)"
echo "  - blacktrace-frontend (UI)"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "🔄 Restarting backend nodes..."

docker restart blacktrace-maker blacktrace-taker blacktrace-settlement

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

echo ""
echo "📊 Service Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(maker|taker|settlement)"

echo ""
echo "========================================"
echo "✅ Done! Proposals have been cleared."
echo "========================================"
echo ""
echo "Note: You will need to log in again in the UI."
