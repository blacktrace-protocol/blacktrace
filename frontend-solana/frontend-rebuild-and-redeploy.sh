#!/bin/bash
# Frontend Rebuild and Redeploy Script
# This script ensures no stale builds are deployed by cleaning, rebuilding, and restarting the container

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="blacktrace-frontend"
IMAGE_NAME="blacktrace-frontend"
PORT="5173"

echo "========================================"
echo "Frontend Rebuild and Redeploy Script"
echo "========================================"
echo ""

# Step 1: Clean old build artifacts
echo "🧹 Step 1: Cleaning old build artifacts..."
rm -rf "$SCRIPT_DIR/dist"
rm -rf "$SCRIPT_DIR/node_modules/.vite"
echo "   ✅ Cleaned dist/ and .vite cache"

# Step 2: Install dependencies (in case any changed)
echo ""
echo "📦 Step 2: Checking dependencies..."
cd "$SCRIPT_DIR"
npm install --silent
echo "   ✅ Dependencies up to date"

# Step 3: Build the frontend
echo ""
echo "🔨 Step 3: Building frontend..."
npm run build
echo "   ✅ Frontend built successfully"

# Step 4: Verify build output exists
echo ""
echo "🔍 Step 4: Verifying build output..."
if [ ! -f "$SCRIPT_DIR/dist/index.html" ]; then
    echo "   ❌ ERROR: dist/index.html not found! Build may have failed."
    exit 1
fi

# Count built assets
JS_FILES=$(find "$SCRIPT_DIR/dist/assets" -name "*.js" 2>/dev/null | wc -l)
CSS_FILES=$(find "$SCRIPT_DIR/dist/assets" -name "*.css" 2>/dev/null | wc -l)
echo "   ✅ Build verified: $JS_FILES JS files, $CSS_FILES CSS files"

# Step 5: Stop and remove old frontend container
echo ""
echo "🛑 Step 5: Stopping old frontend container..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true
echo "   ✅ Old container stopped and removed"

# Step 6: Remove old image to force rebuild
echo ""
echo "🗑️  Step 6: Removing old image..."
docker rmi "$IMAGE_NAME" 2>/dev/null || true
echo "   ✅ Old image removed"

# Step 7: Build new Docker image
echo ""
echo "🔨 Step 7: Building new Docker image..."
docker build --no-cache -t "$IMAGE_NAME" "$SCRIPT_DIR"
echo "   ✅ Docker image built"

# Step 8: Start new frontend container
echo ""
echo "🚀 Step 8: Starting frontend container..."
docker run -d \
    --name "$CONTAINER_NAME" \
    -p "$PORT:$PORT" \
    "$IMAGE_NAME"
echo "   ✅ Frontend container started"

# Step 9: Wait and verify container is running
echo ""
echo "⏳ Step 9: Waiting for frontend to be ready..."
sleep 3

if docker ps | grep -q "$CONTAINER_NAME"; then
    echo "   ✅ Frontend container is running"
else
    echo "   ❌ WARNING: Frontend container may not be running properly"
    docker logs "$CONTAINER_NAME" --tail 20
    exit 1
fi

# Step 10: Show access URL
echo ""
echo "========================================"
echo "✅ Frontend rebuild and redeploy complete!"
echo "========================================"
echo ""
echo "Access the frontend at: http://localhost:$PORT"
echo ""
echo "If you still see stale content:"
echo "  1. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)"
echo "  2. Clear browser cache"
echo "  3. Open in incognito/private window"
echo ""
