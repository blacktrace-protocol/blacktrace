#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Starting BlackTrace - Trustless OTC Settlement"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 Building frontend..."
cd frontend
npm run build > /dev/null 2>&1
cd ..
echo "✅ Frontend built"
echo ""
echo "Starting services:"
echo "  🔌 NATS           - Message broker (port 4222)"
echo "  👤 Alice (Maker)  - Backend node (port 8080)"
echo "  👤 Bob (Taker)    - Backend node (port 8081)"
echo "  🦀 Settlement     - Go HTLC coordinator"
echo "  ⚛️  Frontend       - React UI (port 5173)"
echo ""

# Build and start all services
docker-compose up --build -d

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Services started!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Access the application:"
echo "  🌐 Frontend:      http://localhost:5173"
echo "  📡 Alice API:     http://localhost:8080"
echo "  📡 Bob API:       http://localhost:8081"
echo "  📊 NATS Monitor:  http://localhost:8222"
echo ""
echo "View logs:"
echo "  All services:     docker-compose logs -f"
echo "  Settlement:       docker-compose logs -f settlement-service"
echo "  Alice:            docker-compose logs -f node-maker"
echo "  Bob:              docker-compose logs -f node-taker"
echo "  Frontend:         docker-compose logs -f frontend"
echo ""
echo "Stop services:"
echo "  ./stop.sh  or  docker-compose down"
echo ""
