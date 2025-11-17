# BlackTrace CLI Testing Guide

Complete guide for testing the CLI-node integration with practical examples.

---

## Prerequisites

Build the CLI:
```bash
cd blacktrace-go
go build -o blacktrace
```

---

## Authentication Commands

BlackTrace now includes user authentication with encrypted identity management. Users must register and login before performing trading operations.

### Register a New User

Create a new user identity with an encrypted ECDSA keypair:

```bash
./blacktrace auth register
```

**Interactive Prompts:**
```
Register New User Identity
==========================

Username: alice
Password: ********
Confirm Password: ********

User 'alice' registered successfully!
You can now login with: ./blacktrace auth login
```

**What Happens:**
- Generates ECDSA P-256 keypair
- Encrypts private key with password (AES-256-GCM + PBKDF2)
- Stores identity in `~/.blacktrace/identities/alice.json`

### Login to a Node

Authenticate and create a session:

```bash
./blacktrace auth login
```

**Interactive Prompts:**
```
Login to Node
=============

Username: alice
Password: ********

Login successful!
Logged in as: alice
Session expires: 2025-11-18T22:07:16+05:30

You can now use order and negotiate commands
```

**What Happens:**
- Authenticates user with password
- Decrypts private key
- Creates session with 24-hour expiration
- Saves session token to `~/.blacktrace/session.json`

### Check Current Session

Display information about the currently logged-in user:

```bash
./blacktrace auth whoami
```

**Example Output:**
```
Current Session
===============
Username: alice
Session ID: 703dceff431e156d8e8a0b1bb309f5a2ae0887822f2b1fa9e8983fbbd223b157
API URL: http://localhost:8080
Logged in at: 2025-11-17T22:07:16+05:30
Expires at: 2025-11-18T22:07:16+05:30
```

### Logout

Terminate the current session:

```bash
./blacktrace auth logout
```

**Example Output:**
```
Logged out successfully
```

**Security Features:**
- ECDSA keypairs (P-256 elliptic curve)
- AES-256-GCM encryption for private keys
- PBKDF2 key derivation (100,000 iterations)
- Random salts per identity
- 24-hour session expiration
- Session tokens stored locally

---

## Node Management Commands

Before running tests, familiarize yourself with these node management commands:

### List Running Nodes

Check all running BlackTrace node processes:

```bash
./blacktrace node list
```

**Example Output:**
```
📋 Running BlackTrace Nodes:

  PID: 30728 | Started: 4:01PM | P2P Port: 9001 | API Port: 8081
  PID: 30727 | Started: 4:01PM | P2P Port: 9000 | API Port: 8080

Total: 2 nodes
```

### Kill All Running Nodes

Clean up all running node processes (useful for preventing zombie processes and mDNS pollution):

```bash
./blacktrace node kill-all
```

**Example Output:**
```
⚠️  Killing all BlackTrace node processes...
✅ All BlackTrace nodes killed
💡 Tip: Wait 5 seconds for mDNS cache to expire before starting new nodes
```

### Get Individual Node Details

Query a specific node's status (including peer ID):

```bash
# Default (port 8080)
./blacktrace query status

# Specific node
./blacktrace --api-url http://localhost:8081 query status
```

**Example Output:**
```
📊 Node Status:

Peer ID: 12D3KooWMzrycDnHzjP7PT2BEVHUKvkJoUh2UkayDXkDCLGuN5Yv
Listening: /ip4/127.0.0.1/tcp/9001
Peers: 1
Orders: 0
```

**Best Practice:** Always use `./blacktrace node kill-all` before starting new tests to avoid zombie processes that cause mDNS peer ID confusion.

---

## Single Node Testing

### 1. Start a Node

**Command:**
```bash
./blacktrace node --port 9000 --api-port 8080
```

**Expected Output:**
```
╔══════════════════════════════════════════════╗
║   BlackTrace Node                           ║
╚══════════════════════════════════════════════╝

🚀 Starting BlackTrace node...
   P2P Port: 9000
   API Port: 8080

✅ Node started successfully!

📍 Node Info:
   Peer ID: 12D3KooWH2t6uRSGRyeTfVxnug3nfsu7eDYnWK6kedXqUApyoswn
   Listening on: /ip4/127.0.0.1/tcp/9000

🔌 API Server: http://localhost:8080

🔍 Use this multiaddr to connect other nodes:
   /ip4/127.0.0.1/tcp/9000/p2p/12D3KooWH2t6uRSGRyeTfVxnug3nfsu7eDYnWK6kedXqUApyoswn

Node is running. Press Ctrl+C to stop.
```

**Verification:**
- ✅ Node displays peer ID
- ✅ API server starts on port 8080
- ✅ Multiaddr shown for peer connections
- ✅ No errors in output

---

### 2. Query Node Status

**Command (in a new terminal):**
```bash
./blacktrace query status
```

**Expected Output:**
```
📊 Node Status:

Peer ID: 12D3KooWH2t6uRSGRyeTfVxnug3nfsu7eDYnWK6kedXqUApyoswn
Listening: /ip4/127.0.0.1/tcp/9000
Peers: 0
Orders: 0
```

**Verification:**
- ✅ Shows correct peer ID
- ✅ Shows listening address
- ✅ Peer count is 0 (no peers yet)
- ✅ Order count is 0 (no orders yet)

---

### 3. Create an Order

**Command:**
```bash
./blacktrace order create \
  --amount 10000 \
  --stablecoin USDC \
  --min-price 450 \
  --max-price 470
```

**Expected Output:**
```
📝 Creating order:
   Amount: 10000 ZEC
   Stablecoin: USDC
   Price Range: $450 - $470 per ZEC
   Total Range: $4500000 - $4700000 USDC

✅ Order created: order_1763358093
📤 Broadcasting to network...
```

**Verification:**
- ✅ Order ID generated (timestamp-based)
- ✅ Price range calculated correctly
- ✅ Total range displayed
- ✅ No errors

---

### 4. List Orders

**Command:**
```bash
./blacktrace order list
```

**Expected Output:**
```
🔍 Listing all orders:

📋 Order ID: order_1763358093
   Type: Sell
   Stablecoin: USDC
   Timestamp: 1763358093

Total: 1 orders
```

**Verification:**
- ✅ Shows previously created order
- ✅ Displays order details
- ✅ Count is correct

---

### 5. Request Order Details (Negotiation)

**Command:**
```bash
./blacktrace negotiate request order_1763358093
```

**Expected Output:**
```
💬 Requesting details for order: order_1763358093
✅ Request sent to maker
📨 Waiting for response...
```

**Verification:**
- ✅ Request accepted
- ✅ No errors

---

### 6. Propose a Price

**Command:**
```bash
./blacktrace negotiate propose order_1763358093 \
  --price 460 \
  --amount 10000
```

**Expected Output:**
```
💰 Proposing for order: order_1763358093
   Price: $460 per ZEC
   Amount: 10000 ZEC
   Total: $4600000

✅ Proposal sent
```

**Verification:**
- ✅ Total calculated correctly ($460 × 10000)
- ✅ Proposal accepted
- ✅ No errors

---

### 7. Query Connected Peers

**Command:**
```bash
./blacktrace query peers
```

**Expected Output (single node):**
```
📡 Connected Peers:

No peers connected
```

**Verification:**
- ✅ Shows "No peers" for single node
- ✅ No errors

---

## Two-Node Testing

### Setup

**Terminal 1 - Start Node A (Maker):**
```bash
./blacktrace node --port 9000 --api-port 8080
```

Copy the multiaddr from the output:
```
/ip4/127.0.0.1/tcp/9000/p2p/12D3KooWH2t6uRSGRyeTfVxnug3nfsu7eDYnWK6kedXqUApyoswn
```

**Terminal 2 - Start Node B (Taker):**
```bash
./blacktrace node --port 9001 --api-port 8081 \
  --connect /ip4/127.0.0.1/tcp/9000/p2p/12D3KooWH2t6uRSGRyeTfVxnug3nfsu7eDYnWK6kedXqUApyoswn
```

**Expected Output on Node B:**
```
🔗 Connecting to peer: /ip4/127.0.0.1/tcp/9000/p2p/12D3Koo...
...
Discovered peer via mDNS: 12D3KooWH2t6uRSGRyeTfVxnug3nfsu7eDYnWK6kedXqUApyoswn
Connected to peer: 12D3KooWH2t6uRSGRyeTfVxnug3nfsu7eDYnWK6kedXqUApyoswn
```

---

### Test Scenario: Complete Order Workflow

**Step 1: Create Order on Node A**

Terminal 3 (using Node A's API on port 8080):
```bash
./blacktrace order create \
  --amount 5000 \
  --stablecoin USDC \
  --min-price 455 \
  --max-price 475
```

**Step 2: List Orders on Node B**

Terminal 3 (using Node B's API on port 8081):
```bash
# Note: Need to set API URL for Node B
# For now, manually test by changing apiURL in code or using curl

curl http://localhost:8081/orders
```

**Expected:** Order propagated via gossipsub to Node B

**Step 3: Query Peers on Both Nodes**

On Node A (port 8080):
```bash
./blacktrace query peers
```

Expected:
```
📡 Connected Peers:

🔗 12D3KooW... (Node B's peer ID)
   Address: /ip4/127.0.0.1/tcp/9001

Total: 1 peers
```

On Node B (port 8081):
```bash
# Would need to modify CLI to support --api-port flag
curl http://localhost:8081/peers
```

**Step 4: Negotiate from Node B**

```bash
./blacktrace negotiate request order_<ID>
./blacktrace negotiate propose order_<ID> --price 465 --amount 5000
```

---

## Testing Checklist

### ✅ Single Node Tests
- [ ] Node starts successfully with P2P and API ports
- [ ] `query status` shows correct node info
- [ ] `order create` creates and broadcasts order
- [ ] `order list` shows created orders
- [ ] `negotiate request` sends request
- [ ] `negotiate propose` sends proposal
- [ ] `query peers` shows no peers (single node)

### ✅ Two Node Tests
- [ ] Node B connects to Node A via multiaddr
- [ ] mDNS peer discovery works
- [ ] Both nodes see each other in peer list
- [ ] Orders propagate from Node A to Node B
- [ ] Negotiation messages sent between nodes

### ✅ Error Handling
- [ ] CLI shows error when node not running
- [ ] Invalid order parameters rejected
- [ ] Missing required flags cause error
- [ ] Non-existent order IDs handled gracefully

---

## Common Testing Patterns

### Test 1: Quick Smoke Test
```bash
# Start node
./blacktrace node --port 9000 --api-port 8080 &

# Wait for startup
sleep 2

# Run all commands
./blacktrace query status
./blacktrace order create --amount 1000 --stablecoin USDC --min-price 400 --max-price 500
./blacktrace order list
./blacktrace query peers

# Cleanup
killall blacktrace
```

### Test 2: Order Lifecycle
```bash
# 1. Create order
ORDER_ID=$(./blacktrace order create --amount 10000 --stablecoin USDC --min-price 450 --max-price 470 | grep "Order created:" | awk '{print $4}')

# 2. List to verify
./blacktrace order list

# 3. Request details
./blacktrace negotiate request $ORDER_ID

# 4. Propose price
./blacktrace negotiate propose $ORDER_ID --price 460 --amount 10000

# 5. Counter-propose
./blacktrace negotiate propose $ORDER_ID --price 465 --amount 10000
```

### Test 3: Multiple Orders
```bash
# Create multiple orders
./blacktrace order create --amount 5000 --stablecoin USDC --min-price 450 --max-price 470
./blacktrace order create --amount 8000 --stablecoin USDT --min-price 460 --max-price 480
./blacktrace order create --amount 12000 --stablecoin DAI --min-price 455 --max-price 475

# List all
./blacktrace order list

# Check status
./blacktrace query status
```

---

## Manual Testing Script

Create `test-cli.sh`:

```bash
#!/bin/bash
set -e

echo "=== BlackTrace CLI Integration Test ==="
echo ""

# Start node in background
echo "Starting node..."
./blacktrace node --port 9000 --api-port 8080 > /tmp/bt-node.log 2>&1 &
NODE_PID=$!
sleep 3

echo "✅ Node started (PID: $NODE_PID)"
echo ""

# Test 1: Status
echo "Test 1: Query Status"
./blacktrace query status
echo ""

# Test 2: Create order
echo "Test 2: Create Order"
./blacktrace order create --amount 10000 --stablecoin USDC --min-price 450 --max-price 470
echo ""

# Test 3: List orders
echo "Test 3: List Orders"
./blacktrace order list
echo ""

# Test 4: Query peers
echo "Test 4: Query Peers"
./blacktrace query peers
echo ""

# Cleanup
echo "Cleaning up..."
kill $NODE_PID
wait $NODE_PID 2>/dev/null || true

echo "✅ All tests passed!"
```

Run with:
```bash
chmod +x test-cli.sh
./test-cli.sh
```

---

## Troubleshooting

### Issue: "Error connecting to node"

**Cause:** Node not running or API port mismatch

**Solution:**
```bash
# Check if node is running
ps aux | grep blacktrace

# Check if API port is listening
lsof -i :8080

# Start node if not running
./blacktrace node --port 9000 --api-port 8080
```

### Issue: "No peers connected" in two-node setup

**Cause:** Nodes not discovering each other via mDNS or connection failed

**Solution:**
```bash
# Check node logs
tail -f /tmp/bt-node.log

# Verify both nodes on same network
# Ensure firewall allows connections
# Try explicit connection with --connect flag
```

### Issue: Stale peer IDs / "noise: message is too short" errors

**Cause:** Zombie node processes broadcasting via mDNS

**Symptoms:**
- Logs show "noise: message is too short" errors
- Nodes report wrong peer IDs
- `query status` shows different peer ID than node log
- Multiple failed connection attempts during startup

**Solution:**
```bash
# List all running nodes
./blacktrace node list

# Kill all zombie processes
./blacktrace node kill-all

# Wait for mDNS cache to expire
sleep 5

# Start fresh nodes
./blacktrace node --port 9000 --api-port 8080
```

**Prevention:** Always use `./blacktrace node kill-all` before starting new test runs.

---

### Issue: Orders not appearing on second node

**Cause:** Gossipsub not propagating messages or nodes not connected

**Solution:**
```bash
# Verify nodes are connected
./blacktrace query peers  # Should show peer

# Check node logs for gossipsub messages
# Increase wait time between create and list
```

---

## Future Enhancements

1. **CLI Flag for API URL**
   ```bash
   ./blacktrace --api http://localhost:8081 order list
   ```

2. **Interactive Mode**
   ```bash
   ./blacktrace interactive
   > create order --amount 10000 ...
   > list orders
   > quit
   ```

3. **Watch Mode**
   ```bash
   ./blacktrace order list --watch  # Auto-refresh
   ```

4. **JSON Output**
   ```bash
   ./blacktrace order list --json | jq .
   ```

---

## Next Steps

After CLI testing is complete:
1. Test with 3+ nodes
2. Test negotiation across nodes
3. Add integration tests
4. Proceed to on-chain integration (Zcash L1 + Ztarknet L2)

---

## See Also

- **[TWO_NODE_DEMO.md](TWO_NODE_DEMO.md)** - Complete two-node maker/taker demonstration with real P2P message exchange

---

**Last Updated:** 2025-11-17
**Status:** ✅ All CLI commands tested and working
**Two-Node Demo:** ✅ P2P maker/taker workflow verified
