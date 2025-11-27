#!/bin/bash

# BlackTrace Docker Stop Script
# Usage: ./scripts/stop.sh [mode] [options]
#
# Modes:
#   demo       - Stop core services only (default)
#   full       - Stop all services including blockchain nodes
#   blockchains - Stop blockchain nodes only
#   all        - Stop everything (both compose files)
#
# Options:
#   --volumes, -v  - Also remove volumes (reset all data)

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
MODE="demo"
VOLUMES=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        demo|full|blockchains|all)
            MODE="$1"
            shift
            ;;
        --volumes|-v)
            VOLUMES="-v"
            shift
            ;;
        --help|-h)
            echo "BlackTrace Docker Stop Script"
            echo ""
            echo "Usage: $0 [mode] [options]"
            echo ""
            echo "Modes:"
            echo "  demo        Stop core services only (default)"
            echo "  full        Stop all services including blockchain nodes"
            echo "  blockchains Stop blockchain nodes only"
            echo "  all         Stop everything (both compose files)"
            echo ""
            echo "Options:"
            echo "  --volumes, -v  Also remove volumes (reset all data)"
            echo "  --help         Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                # Stop demo services"
            echo "  $0 full           # Stop full stack"
            echo "  $0 all -v         # Stop everything and remove volumes"
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
echo "  Stopping BlackTrace Services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$PROJECT_ROOT"

case $MODE in
    demo)
        echo "Stopping core services..."
        docker-compose -f config/docker-compose.yml down $VOLUMES
        ;;
    full)
        echo "Stopping all services (core + blockchains)..."
        docker-compose -f config/docker-compose.yml -f config/docker-compose.blockchains.yml down $VOLUMES
        ;;
    blockchains)
        echo "Stopping blockchain nodes..."
        docker-compose -f config/docker-compose.blockchains.yml down $VOLUMES
        ;;
    all)
        echo "Stopping all services..."
        docker-compose -f config/docker-compose.yml down $VOLUMES 2>/dev/null || true
        docker-compose -f config/docker-compose.blockchains.yml down $VOLUMES 2>/dev/null || true
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Services stopped"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -z "$VOLUMES" ]; then
    echo "To also remove volumes (reset all data):"
    echo "  ./scripts/stop.sh $MODE -v"
    echo ""
fi
