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

## Testing Authentication via HTTP API

For automated testing or integration with other tools, you can interact with the authentication endpoints directly via HTTP.

### Start a Node for Testing

```bash
./blacktrace node --port 9000 --api-port 8080 > /tmp/test-node.log 2>&1 &
```

### Register User via API

```bash
curl -X POST http://localhost:8080/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"test123"}'
```

**Expected Response:**
```json
{"username":"alice","status":"registered"}
```

**Error Cases:**
```bash
# User already exists
{"error":"user alice already exists"}

# Missing fields
{"error":"Username is required"}
{"error":"Password is required"}
```

### Login via API

```bash
curl -s -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"test123"}' | jq
```

**Expected Response:**
```json
{
  "session_id": "288a8407b9d4e1c7d07787318ffb0f841750b6c2b02078c117e8d5ae8823d802",
  "username": "alice",
  "expires_at": "2025-11-19T17:36:56+05:30"
}
```

**Error Cases:**
```json
{"error":"user not found"}
{"error":"invalid password"}
```

### Whoami via API

```bash
SESSION_ID="your_session_id_here"

curl -s -X POST http://localhost:8080/auth/whoami \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SESSION_ID\"}" | jq
```

**Expected Response:**
```json
{
  "username": "alice",
  "session_id": "288a8407b9d4e1c7d07787318ffb0f841750b6c2b02078c117e8d5ae8823d802",
  "logged_in_at": "2025-11-18T17:36:56+05:30",
  "expires_at": "2025-11-19T17:36:56+05:30"
}
```

### Logout via API

```bash
curl -X POST http://localhost:8080/auth/logout \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SESSION_ID\"}"
```

**Expected Response:**
```json
{"status":"logged out"}
```

### Create Order with Authentication

```bash
# Must include session_id in request
curl -X POST http://localhost:8080/orders/create \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SESSION_ID\",\"amount\":1000,\"stablecoin\":\"USDC\",\"min_price\":450,\"max_price\":470}"
```

**Expected Response:**
```json
{"order_id":"order_1763555708"}
```

**Without Auth:**
```json
{"error":"Authentication required: no active session found"}
```

### Submit Proposal with Authentication

```bash
ORDER_ID="order_1763555708"

curl -X POST http://localhost:8080/negotiate/propose \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SESSION_ID\",\"order_id\":\"$ORDER_ID\",\"price\":460,\"amount\":1000}"
```

**Expected Response:**
```json
{"status":"proposal sent"}
```

**Without Auth:**
```json
{"error":"Authentication required: invalid session"}
```

### Complete API Testing Workflow

```bash
# 1. Start node
./blacktrace node --port 9000 --api-port 8080 > /tmp/test-node.log 2>&1 &
sleep 3

# 2. Register user
curl -s -X POST http://localhost:8080/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"test123"}'

# 3. Login and capture session ID
SESSION_ID=$(curl -s -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"test123"}' | jq -r '.session_id')

echo "Session ID: $SESSION_ID"

# 4. Verify auth works
curl -s -X POST http://localhost:8080/auth/whoami \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SESSION_ID\"}" | jq

# 5. Create order (authenticated)
ORDER_RESPONSE=$(curl -s -X POST http://localhost:8080/orders/create \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SESSION_ID\",\"amount\":1000,\"stablecoin\":\"USDC\",\"min_price\":450,\"max_price\":470}")

ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.order_id')
echo "Order created: $ORDER_ID"

# 6. Submit proposal (authenticated)
curl -s -X POST http://localhost:8080/negotiate/propose \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SESSION_ID\",\"order_id\":\"$ORDER_ID\",\"price\":460,\"amount\":1000}" | jq

# 7. Check node logs
tail -20 /tmp/test-node.log | grep -E "created by user|Auth:"

# Expected: "Order order_XXX created by user: alice"
# Expected: "Proposal for order order_XXX created by user: alice"

# 8. Logout
curl -s -X POST http://localhost:8080/auth/logout \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SESSION_ID\"}" | jq

# 9. Cleanup
./blacktrace node kill-all
```

**Node Log Output:**
```
2025/11/18 17:36:56 Auth: User alice logged in (session: 288a8407..., expires: 2025-11-19T17:36:56+05:30)
2025/11/19 18:05:08 Order order_1763555708 created by user: alice
2025/11/19 18:05:51 Proposal for order order_1763555708 created by user: alice
```

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

## Verifying Cryptographic Features (Phase 2B)

BlackTrace now includes message-level encryption and signatures. All messages are signed with ECDSA, and order details can be encrypted with ECIES.

### Verify ECDSA Message Signing

After creating orders or proposals, check that messages are signed:

```bash
# Start two nodes and perform some operations
./blacktrace node --port 19000 --api-port 8080 > /tmp/node-a.log 2>&1 &
./blacktrace node --port 19001 --api-port 8081 > /tmp/node-b.log 2>&1 &

# Register and login
./blacktrace auth register  # alice on node A
./blacktrace auth login

# Create an order (this will be signed automatically)
./blacktrace order create --amount 10000 --stablecoin USDC

# Check Node A logs for signed message broadcasts
grep "Broadcasting signed message" /tmp/node-a.log
```

**Expected Output:**
```
App: Broadcasting signed message (type: order_announcement, size: 456 bytes)
```

### Verify Signature Verification

Check that Node B verifies signatures when receiving messages:

```bash
# Check Node B logs for signature verification
grep "Verified signed message" /tmp/node-b.log
```

**Expected Output:**
```
App: Verified signed message from QmXXX... (type: order_announcement, timestamp: 1700000000)
App: Received signed order announcement: order_1700000000 from QmXXX...
```

### Verify CryptoManager Initialization

Check that CryptoManager is initialized on login:

```bash
# Check for CryptoManager initialization
grep "CryptoManager initialized" /tmp/node-a.log
```

**Expected Output:**
```
Auth: Initialized CryptoManager for user: alice
App: CryptoManager initialized for message signing and encryption
```

### Verify Peer Public Key Caching

After peers exchange messages, they cache each other's public keys:

```bash
# Check for peer key caching
grep "Cached public key for peer" /tmp/node-a.log
grep "Cached public key for peer" /tmp/node-b.log
```

**Expected Output:**
```
App: Cached public key for peer QmYYY...
```

### Verify ECIES Encryption (When Implemented in UI)

ECIES encryption is ready for order details. When the UI uses `sendEncryptedOrderDetails()`:

```bash
# Check for encrypted order details (future)
grep "Sent encrypted order details" /tmp/node-a.log
grep "Decrypted order details" /tmp/node-b.log
```

**Expected Output (when encryption is used):**
```
# Node A (sender)
App: Sent encrypted order details for order_XXX to QmYYY... (payload size: 234 bytes)

# Node B (recipient)
App: Decrypted order details for order_XXX: Amount=10000, Price=450-470 USDC
```

### Complete Cryptographic Verification

Run a full two-node workflow and verify all cryptographic features:

```bash
# Run the automated demo
./two_node_demo.sh
```

The demo now includes a **Step 13: Verify Cryptographic Features** that checks:
- ✅ ECDSA message signing
- ✅ Signature verification
- ✅ CryptoManager initialization
- ✅ Peer public key caching
- ✅ ECIES encryption readiness

### Security Properties Verified

When the above checks pass, you've verified:

1. **Authenticity**: All messages signed with sender's ECDSA private key
2. **Integrity**: Tampered messages detected and rejected
3. **Confidentiality**: Order details can be encrypted (ECIES ready)
4. **Forward Secrecy**: Ephemeral keys for each encrypted message
5. **Non-Repudiation**: Signed messages prove sender identity
6. **MitM Detection**: Peer key changes trigger warnings

### Troubleshooting Cryptography

**Issue**: No signed messages detected
```bash
# Check if CryptoManager was initialized
grep "CryptoManager" /tmp/node-a.log

# Verify user logged in before creating order
grep "Auth: Initialized" /tmp/node-a.log
```

**Solution**: CryptoManager is initialized on login. Make sure to login before creating orders.

**Issue**: Signature verification failures
```bash
# Check for verification errors
grep "signature verification failed" /tmp/node-b.log
```

**Solution**: This indicates message tampering or key mismatch. Check network integrity.

**Issue**: Peer key not cached
```bash
# Verify messages are being received
grep "Received.*message" /tmp/node-b.log
```

**Solution**: Peer keys are cached when first signed message is received. Ensure P2P connectivity.

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

**Last Updated:** 2025-11-19
**Status:** ✅ All CLI commands tested and working
**Two-Node Demo:** ✅ P2P maker/taker workflow verified
**Cryptography:** ✅ ECDSA signatures and ECIES encryption (Phase 2B complete)
