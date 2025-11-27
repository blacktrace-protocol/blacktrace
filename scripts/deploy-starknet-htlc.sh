#!/bin/bash

# Starknet HTLC Contract Deployment Script
#
# Prerequisites:
#   - starkli 0.3.5 installed (starkliup -v 0.3.5)
#   - Starknet devnet running on localhost:5050
#   - Contract compiled with scarb build
#
# Usage:
#   ./scripts/deploy-starknet-htlc.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONTRACT_DIR="$PROJECT_ROOT/connectors/starknet/htlc-contract"
FRONTEND_FILE="$PROJECT_ROOT/frontend/src/lib/starknet.tsx"

# Devnet account 0 (Bob) - used for deployment
DEPLOYER_ADDRESS="0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691"
DEPLOYER_PRIVATE_KEY="0x71d7bb07b9a64f6f78ac4c816aff4da9"
DEPLOYER_PUBLIC_KEY="0x39d9e6ce352ad4530a0ef5d5a18fd3303c3606a7fa6ac5b620020ad681cc33b"

RPC_URL="http://localhost:5050"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starknet HTLC Contract Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check starkli version
STARKLI_VERSION=$(starkli --version 2>/dev/null | head -1 || echo "not installed")
echo "starkli version: $STARKLI_VERSION"

if [[ ! "$STARKLI_VERSION" =~ "0.3.5" ]]; then
    echo ""
    echo "WARNING: starkli 0.3.5 recommended. Install with:"
    echo "  starkliup -v 0.3.5"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check devnet is running
echo ""
echo "Checking Starknet devnet..."
if ! curl -s "$RPC_URL/is_alive" | grep -q "Alive"; then
    echo "ERROR: Starknet devnet not running at $RPC_URL"
    echo "Start it with: ./scripts/start.sh full"
    exit 1
fi
echo "Devnet is running"

# Get account class hash from devnet
echo ""
echo "Fetching account class hash..."
CLASS_HASH_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "{
  \"jsonrpc\": \"2.0\",
  \"id\": 1,
  \"method\": \"starknet_getClassHashAt\",
  \"params\": {
    \"block_id\": \"latest\",
    \"contract_address\": \"$DEPLOYER_ADDRESS\"
  }
}" "$RPC_URL")

ACCOUNT_CLASS_HASH=$(echo "$CLASS_HASH_RESPONSE" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ACCOUNT_CLASS_HASH" ]; then
    echo "ERROR: Could not get account class hash"
    echo "Response: $CLASS_HASH_RESPONSE"
    exit 1
fi

echo "Account class hash: $ACCOUNT_CLASS_HASH"

# Create account file
ACCOUNT_FILE="/tmp/starknet-deployer-account.json"
cat > "$ACCOUNT_FILE" << EOF
{
    "version": 1,
    "variant": {
        "type": "open_zeppelin",
        "version": 1,
        "public_key": "$DEPLOYER_PUBLIC_KEY",
        "legacy": false
    },
    "deployment": {
        "status": "deployed",
        "class_hash": "$ACCOUNT_CLASS_HASH",
        "address": "$DEPLOYER_ADDRESS"
    }
}
EOF
echo "Created account file: $ACCOUNT_FILE"

# Check contract is compiled
CONTRACT_FILE="$CONTRACT_DIR/target/dev/blacktrace_htlc_HTLC.contract_class.json"
if [ ! -f "$CONTRACT_FILE" ]; then
    echo ""
    echo "Contract not compiled. Building..."
    cd "$CONTRACT_DIR"
    scarb build
    cd "$PROJECT_ROOT"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Declaring Contract"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

export STARKNET_RPC="$RPC_URL"

DECLARE_OUTPUT=$(starkli declare \
    --account "$ACCOUNT_FILE" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --watch \
    "$CONTRACT_FILE" 2>&1)

echo "$DECLARE_OUTPUT"

# Extract class hash from output
CONTRACT_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep "Class hash declared:" -A1 | tail -1 | tr -d ' ')

if [ -z "$CONTRACT_CLASS_HASH" ]; then
    # Try alternate pattern (already declared)
    CONTRACT_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep "Declaring Cairo 1 class:" | grep -o "0x[a-f0-9]*")
fi

if [ -z "$CONTRACT_CLASS_HASH" ]; then
    echo "ERROR: Could not extract class hash from declare output"
    exit 1
fi

echo ""
echo "Contract class hash: $CONTRACT_CLASS_HASH"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying Contract"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

DEPLOY_OUTPUT=$(starkli deploy \
    --account "$ACCOUNT_FILE" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --watch \
    "$CONTRACT_CLASS_HASH" 2>&1)

echo "$DEPLOY_OUTPUT"

# Extract contract address from output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "Contract deployed:" -A1 | tail -1 | tr -d ' ')

if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "ERROR: Could not extract contract address from deploy output"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Contract Class Hash: $CONTRACT_CLASS_HASH"
echo "Contract Address:    $CONTRACT_ADDRESS"
echo ""

# Update frontend if file exists
if [ -f "$FRONTEND_FILE" ]; then
    echo "Updating frontend contract address..."
    sed -i.bak "s|const HTLC_CONTRACT_ADDRESS = '0x[a-fA-F0-9]*'|const HTLC_CONTRACT_ADDRESS = '$CONTRACT_ADDRESS'|" "$FRONTEND_FILE"
    rm -f "$FRONTEND_FILE.bak"
    echo "Updated: $FRONTEND_FILE"
    echo ""
fi

# Update DEPLOYMENT.md
DEPLOYMENT_FILE="$CONTRACT_DIR/DEPLOYMENT.md"
cat > "$DEPLOYMENT_FILE" << EOF
# Starknet HTLC Contract Deployment

## Contract Details

**Network**: Starknet Devnet (local)
**RPC URL**: http://localhost:5050

### Deployed Contract

- **Class Hash**: \`$CONTRACT_CLASS_HASH\`
- **Contract Address**: \`$CONTRACT_ADDRESS\`
- **Deployed**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

### Deployer Account

- **Address**: \`$DEPLOYER_ADDRESS\`
- **Public Key**: \`$DEPLOYER_PUBLIC_KEY\`

## Contract Interface

### Functions

#### \`lock(hash_lock: felt252, receiver: ContractAddress, timeout: u64, amount: u256)\`
Lock STRK tokens in the HTLC contract.

#### \`claim(secret: felt252)\`
Claim the locked STRK by revealing the secret.

#### \`refund()\`
Refund the locked STRK back to the sender after timeout.

#### \`get_htlc_details() -> HTLCDetails\`
Read-only function to get the current state of the HTLC.

## Quick Test

\`\`\`bash
# Get HTLC details
starkli call \\
    --rpc http://localhost:5050 \\
    $CONTRACT_ADDRESS \\
    get_htlc_details
\`\`\`

## See Also

- \`starknet-tooling.md\` - Tool version compatibility guide
EOF

echo "Updated: $DEPLOYMENT_FILE"
echo ""
echo "Done! You can now test the HTLC contract."
