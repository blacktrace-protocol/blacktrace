#!/bin/bash

# BlackTrace Docker Startup Script
# Usage: ./scripts/start.sh [mode] [options]
#
# Modes:
#   demo       - Core services only (default) - for encrypted negotiation demo
#   full       - Full stack with blockchain nodes - for HTLC settlement testing
#   blockchains - Blockchain nodes only
#
# Options:
#   --build    - Force rebuild of images (default: enabled)
#   --no-build - Skip rebuilding images
#   --detach   - Run in background (default: enabled)
#   --attach   - Run in foreground (follow logs)
#   --clean    - Remove volumes before starting (fresh start)

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"

# Default values
MODE="demo"
BUILD="--build"
DETACH="-d"
CLEAN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        demo|full|blockchains)
            MODE="$1"
            shift
            ;;
        --build)
            BUILD="--build"
            shift
            ;;
        --no-build)
            BUILD=""
            shift
            ;;
        --detach|-d)
            DETACH="-d"
            shift
            ;;
        --attach|-a)
            DETACH=""
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        --help|-h)
            echo "BlackTrace Docker Startup Script"
            echo ""
            echo "Usage: $0 [mode] [options]"
            echo ""
            echo "Modes:"
            echo "  demo        Core services only (default)"
            echo "              - NATS, Maker node, Taker node, Settlement service"
            echo "              - For demonstrating encrypted P2P negotiation"
            echo ""
            echo "  full        Full stack with blockchain nodes"
            echo "              - All core services + Zcash regtest + Starknet devnet"
            echo "              - For testing actual HTLC settlement"
            echo ""
            echo "  blockchains Blockchain nodes only"
            echo "              - Zcash regtest + Starknet devnet"
            echo "              - For running blockchain nodes separately"
            echo ""
            echo "Options:"
            echo "  --build     Force rebuild of Docker images (default)"
            echo "  --no-build  Skip rebuilding images"
            echo "  --detach    Run containers in background (default)"
            echo "  --attach    Run in foreground (follow logs)"
            echo "  --clean     Remove volumes before starting (fresh state)"
            echo "  --help      Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                     # Start demo mode (default)"
            echo "  $0 full                # Start full stack with blockchains"
            echo "  $0 full --clean        # Fresh start with blockchain nodes"
            echo "  $0 demo --attach       # Start demo and follow logs"
            echo "  $0 blockchains         # Start only blockchain nodes"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  BlackTrace - Trustless OTC Settlement"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Change to project root
cd "$PROJECT_ROOT"

# Build compose command based on mode
case $MODE in
    demo)
        echo "Mode: DEMO (Core services only)"
        echo ""
        echo "Starting services:"
        echo "  NATS           - Message broker (port 4222)"
        echo "  Alice (Maker)  - Backend node (port 8080)"
        echo "  Bob (Taker)    - Backend node (port 8081)"
        echo "  Settlement     - HTLC coordinator (port 8090)"
        echo ""
        COMPOSE_CMD="docker-compose -f config/docker-compose.yml"
        ;;
    full)
        echo "Mode: FULL (Core + Blockchain nodes)"
        echo ""
        echo "Starting services:"
        echo "  NATS           - Message broker (port 4222)"
        echo "  Alice (Maker)  - Backend node (port 8080)"
        echo "  Bob (Taker)    - Backend node (port 8081)"
        echo "  Settlement     - HTLC coordinator (port 8090)"
        echo "  Zcash Regtest  - Zcash node (port 18232)"
        echo "  Starknet Dev   - Starknet devnet (port 5050)"
        echo ""
        COMPOSE_CMD="docker-compose -f config/docker-compose.yml -f config/docker-compose.blockchains.yml"
        ;;
    blockchains)
        echo "Mode: BLOCKCHAINS only"
        echo ""
        echo "Starting services:"
        echo "  Zcash Regtest  - Zcash node (port 18232)"
        echo "  Starknet Dev   - Starknet devnet (port 5050)"
        echo ""
        COMPOSE_CMD="docker-compose -f config/docker-compose.blockchains.yml"
        ;;
esac

# Clean volumes if requested
if [ "$CLEAN" = true ]; then
    echo "Cleaning up existing volumes..."
    $COMPOSE_CMD down -v 2>/dev/null || true
    echo "Cleanup complete"
    echo ""
fi

# Build frontend if it exists and we're in demo/full mode
if [ "$MODE" != "blockchains" ] && [ -d "$PROJECT_ROOT/frontend" ]; then
    echo "Building frontend..."
    cd "$PROJECT_ROOT/frontend"
    npm run build > /dev/null 2>&1 || echo "Frontend build skipped (npm not available or build failed)"
    cd "$PROJECT_ROOT"
    echo ""
fi

# Run docker-compose
echo "Running: $COMPOSE_CMD up $BUILD $DETACH"
echo ""

$COMPOSE_CMD up $BUILD $DETACH

# Print helpful info if running in detached mode
if [ -n "$DETACH" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Services started!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Access the application:"
    if [ "$MODE" != "blockchains" ]; then
        echo "  Alice API:     http://localhost:8080"
        echo "  Bob API:       http://localhost:8081"
        echo "  Settlement:    http://localhost:8090"
        echo "  NATS Monitor:  http://localhost:8222"
    fi
    if [ "$MODE" = "full" ] || [ "$MODE" = "blockchains" ]; then
        echo "  Zcash RPC:     http://localhost:18232"
        echo "  Starknet RPC:  http://localhost:5050"
    fi
    echo ""
    echo "View logs:"
    echo "  All services:     $COMPOSE_CMD logs -f"
    if [ "$MODE" != "blockchains" ]; then
        echo "  Settlement:       $COMPOSE_CMD logs -f settlement-service"
        echo "  Alice:            $COMPOSE_CMD logs -f node-maker"
        echo "  Bob:              $COMPOSE_CMD logs -f node-taker"
    fi
    if [ "$MODE" = "full" ] || [ "$MODE" = "blockchains" ]; then
        echo "  Zcash:            $COMPOSE_CMD logs -f zcash-regtest"
        echo "  Starknet:         $COMPOSE_CMD logs -f starknet-devnet"
    fi
    echo ""
    echo "Stop services:"
    echo "  ./scripts/stop.sh $MODE"
    echo ""
fi
