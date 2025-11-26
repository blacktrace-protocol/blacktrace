#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 Cleaning and Restarting BlackTrace"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📦 Stopping all services..."
docker-compose down

echo ""
echo "🗑️  Removing old proposal data..."
docker volume rm blacktrace-go_maker-data 2>/dev/null || true
docker volume rm blacktrace-go_taker-data 2>/dev/null || true
docker volume rm blacktrace-go_shared-identities 2>/dev/null || true

echo ""
echo "📦 Building frontend..."
cd frontend
npm run build > /dev/null 2>&1
cd ..
echo "✅ Frontend built"

echo ""
echo "🚀 Starting all services with fresh state..."
docker-compose up --build -d

echo ""
echo "⏳ Waiting for services to initialize..."
sleep 5

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Clean restart complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "All old proposals have been cleared. You can now:"
echo "  1. Refresh the frontend (http://localhost:5173)"
echo "  2. Create new orders and proposals"
echo "  3. Test the settlement flow cleanly"
echo ""
echo "View logs:"
echo "  docker-compose logs -f settlement-service"
echo ""
