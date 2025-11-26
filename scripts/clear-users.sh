#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 Clearing All Users and Data"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  This will delete:"
echo "   • All user accounts (Alice, Bob, etc.)"
echo "   • All wallet mappings"
echo "   • All orders and proposals"
echo "   • All session data"
echo ""

echo "📦 Stopping all services..."
docker-compose down

echo ""
echo "🗑️  Removing all user data..."
docker volume rm blacktrace-go_maker-data 2>/dev/null || true
docker volume rm blacktrace-go_taker-data 2>/dev/null || true
docker volume rm blacktrace-go_shared-identities 2>/dev/null || true

echo ""
echo "🚀 Restarting services with clean slate..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to initialize..."
sleep 5

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All users cleared!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "You can now:"
echo "  1. Refresh the frontend (http://localhost:5173)"
echo "  2. Register new users (Alice, Bob, etc.)"
echo "  3. Each new registration will create a Zcash wallet automatically"
echo ""
echo "View logs:"
echo "  docker-compose logs -f node-maker"
echo "  docker-compose logs -f node-taker"
echo ""
