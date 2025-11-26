#!/bin/bash

# BlackTrace Folder Reorganization Script
# Preserves git history using git mv

set -e  # Exit on error

echo "🔄 BlackTrace Folder Reorganization"
echo "===================================="
echo ""

# Step 1: Navigate to blacktrace-go
cd blacktrace-go

# Step 2: Create new folder structure
echo "📁 Creating new folder structure..."
mkdir -p services/node
mkdir -p services/settlement
mkdir -p connectors/zcash
mkdir -p connectors/starknet/htlc-contract
mkdir -p tests/integration
mkdir -p scripts/deploy
mkdir -p config
mkdir -p examples

echo "✓ Folders created"

# Step 3: Move core services
echo ""
echo "📦 Moving core services..."

# Node service files
git mv node/*.go services/node/
git mv node/Dockerfile services/node/
# Keep cmd/ at root for now

# Settlement service files
git mv settlement-service/*.go services/settlement/
git mv settlement-service/Dockerfile services/settlement/

echo "✓ Services moved"

# Step 4: Move connectors
echo ""
echo "🔌 Moving chain connectors..."

# Zcash connector
git mv settlement-service/zcash/*.go connectors/zcash/

# Starknet connector
if [ -d "starknet-contracts" ]; then
    git mv starknet-contracts/* connectors/starknet/htlc-contract/
fi

echo "✓ Connectors moved"

# Step 5: Move configuration
echo ""
echo "⚙️  Moving configuration files..."

git mv docker-compose.yml config/
git mv zcash.conf config/ 2>/dev/null || true
if [ -f ".env.example" ]; then
    git mv .env.example config/
fi

echo "✓ Configuration moved"

# Step 6: Move scripts
echo ""
echo "📜 Moving scripts..."

git mv clean-restart.sh scripts/
git mv two_node_demo.sh scripts/ 2>/dev/null || true

echo "✓ Scripts moved"

# Step 7: Move tests
echo ""
echo "🧪 Organizing tests..."

git mv tests/e2e-test.sh tests/integration/ 2>/dev/null || true
# api-test-suite.sh stays at tests/

echo "✓ Tests organized"

# Step 8: Clean up empty directories
echo ""
echo "🧹 Cleaning up..."

rmdir node 2>/dev/null || true
rmdir settlement-service/zcash 2>/dev/null || true
rmdir settlement-service 2>/dev/null || true
rmdir starknet-contracts 2>/dev/null || true

echo "✓ Cleanup done"

echo ""
echo "✅ Folder reorganization complete!"
echo ""
echo "Next steps:"
echo "1. Update import paths in Go files"
echo "2. Update docker-compose.yml paths"
echo "3. Test build and run"
