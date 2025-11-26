# Phase 2B Integration Plan - Complete Implementation Guide

**Status**: Foundation Complete ✅ | Integration In Progress 🔄

---

## Progress Summary

### ✅ Completed
1. **Crypto utilities** (`node/crypto.go`)
   - ECIES encryption/decryption
   - ECDSA signing/verification
   - All tests passing

2. **Message types updated** (`node/types.go`)
   - Added `SignedMessage` type
   - Added `MarshalSignedMessage()` and `UnmarshalSignedMessage()` helpers
   - Added `EncryptedOrderDetailsMessage` type

3. **App structure updated** (`node/app.go`)
   - Added `cryptoMgr *CryptoManager` field
   - Added `peerKeys map[PeerID][]byte` for caching peer public keys
   - Added `SetCryptoManager()` method

### 🔄 Remaining Work

---

## Implementation Steps

### Step 1: Update API Login Handler

**File**: `node/api.go`

**Location**: `handleAuthLogin()` function (around line 228)

**Changes**:
```go
func (api *APIServer) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	// ... existing code for login ...

	// After successful login, initialize CryptoManager
	authMgr := api.app.GetAuthManager()
	session, err := authMgr.GetSession(sessionID)
	if err != nil {
		api.sendError(w, "Failed to get session details", http.StatusInternalServerError)
		return
	}

	// Initialize CryptoManager with user's private key (ONE TIME per node)
	if api.app.cryptoMgr == nil {
		cryptoMgr := NewCryptoManager(session.PrivateKey)
		api.app.SetCryptoManager(cryptoMgr)
		log.Printf("Auth: Initialized CryptoManager for user: %s", session.Username)
	}

	// ... rest of existing code ...
}
```

**Reasoning**: When the first user logs in, we initialize the node's CryptoManager. This follows the "one node = one user" design.

---

### Step 2: Update Message Sending to Sign Messages

**File**: `node/app.go`

**Function to Add**:
```go
// broadcastSignedMessage signs and broadcasts a message via gossipsub
func (app *BlackTraceApp) broadcastSignedMessage(msgType string, payload interface{}) error {
	// Check if crypto manager is initialized
	if app.cryptoMgr == nil {
		// Graceful degradation: send unsigned message
		log.Printf("Warning: CryptoManager not initialized, sending unsigned message")
		data, err := MarshalMessage(msgType, payload)
		if err != nil {
			return err
		}
		return app.network.BroadcastMessage(data)
	}

	// Sign the message
	data, err := MarshalSignedMessage(msgType, payload, app.cryptoMgr)
	if err != nil {
		return fmt.Errorf("failed to sign message: %w", err)
	}

	log.Printf("App: Broadcasting signed message (type: %s, size: %d bytes)", msgType, len(data))
	return app.network.BroadcastMessage(data)
}

// sendSignedMessage signs and sends a message to a specific peer
func (app *BlackTraceApp) sendSignedMessage(to PeerID, msgType string, payload interface{}) error {
	if app.cryptoMgr == nil {
		log.Printf("Warning: CryptoManager not initialized, sending unsigned message")
		data, err := MarshalMessage(msgType, payload)
		if err != nil {
			return err
		}
		return app.network.SendMessage(to, data)
	}

	data, err := MarshalSignedMessage(msgType, payload, app.cryptoMgr)
	if err != nil {
		return fmt.Errorf("failed to sign message: %w", err)
	}

	log.Printf("App: Sending signed message to %s (type: %s)", to, msgType)
	return app.network.SendMessage(to, data)
}
```

---

### Step 3: Update Message Receiving to Verify Signatures

**File**: `node/app.go`

**Function**: `handleMessage()` (around line 119)

**Changes**:
```go
func (app *BlackTraceApp) handleMessage(from PeerID, data []byte) {
	// Try to parse as signed message first
	signedMsg, err := UnmarshalSignedMessage(data)
	if err != nil {
		// Fallback to unsigned message (for backward compatibility during transition)
		log.Printf("Warning: Received unsigned message from %s: %v", from, err)
		msg, err := UnmarshalMessage(data)
		if err != nil {
			log.Printf("Failed to unmarshal message: %v", err)
			return
		}
		app.handleMessagePayload(from, msg.Type, msg.Payload, nil)
		return
	}

	// Cache peer's public key
	app.cachePeerPublicKey(from, signedMsg.SignerPublicKey)

	log.Printf("App: Verified signed message from %s (type: %s, timestamp: %d)",
		from, signedMsg.Type, signedMsg.Timestamp)

	// Handle the verified message
	app.handleMessagePayload(from, signedMsg.Type, signedMsg.Payload, signedMsg.SignerPublicKey)
}

// handleMessagePayload processes the actual message content
func (app *BlackTraceApp) handleMessagePayload(from PeerID, msgType string, payload json.RawMessage, signerPubKey []byte) {
	switch msgType {
	case "order_announcement":
		var announcement OrderAnnouncement
		if err := json.Unmarshal(payload, &announcement); err != nil {
			log.Printf("Failed to unmarshal order announcement: %v", err)
			return
		}

		log.Printf("App: Received signed order announcement: %s from %s", announcement.OrderID, from)

		app.ordersMux.Lock()
		app.orders[announcement.OrderID] = &announcement
		app.ordersMux.Unlock()

	case "proposal":
		var proposal Proposal
		if err := json.Unmarshal(payload, &proposal); err != nil {
			log.Printf("Failed to unmarshal proposal: %v", err)
			return
		}

		log.Printf("App: Received signed proposal: %s from %s", proposal.ProposalID, from)

		app.proposalsMux.Lock()
		app.proposals[proposal.ProposalID] = &proposal
		app.proposalsMux.Unlock()

	// ... other cases ...
	}
}

// cachePeerPublicKey stores a peer's public key
func (app *BlackTraceApp) cachePeerPublicKey(peerID PeerID, pubKey []byte) {
	app.peerKeysMux.Lock()
	defer app.peerKeysMux.Unlock()

	// Check if we already have this peer's key
	if existing, ok := app.peerKeys[peerID]; ok {
		// Verify it matches (detect key changes/MitM attempts)
		if !bytes.Equal(existing, pubKey) {
			log.Printf("WARNING: Peer %s public key changed! Possible MitM attack!", peerID)
			log.Printf("  Old key: %x", existing[:8])
			log.Printf("  New key: %x", pubKey[:8])
		}
		return
	}

	// Cache new key
	app.peerKeys[peerID] = pubKey
	log.Printf("App: Cached public key for peer %s", peerID)
}
```

---

### Step 4: Update Order Broadcast to Use Signed Messages

**File**: `node/app.go`

**Function**: `handleAppCommand()` - "create_order" case (around line 200)

**Changes**:
```go
case "create_order":
	orderID := NewOrderID()
	announcement := OrderAnnouncement{
		OrderID:    orderID,
		OrderType:  OrderTypeSell,
		Stablecoin: cmd.Stablecoin,
		Timestamp:  time.Now().Unix(),
		Expiry:     time.Now().Add(24 * time.Hour).Unix(),
	}

	// Store order details for later encryption
	// ... existing code ...

	// Broadcast SIGNED announcement
	if err := app.broadcastSignedMessage("order_announcement", announcement); err != nil {
		log.Printf("Failed to broadcast order announcement: %v", err)
		if cmd.ResponseCh != nil {
			cmd.ResponseCh <- fmt.Errorf("broadcast failed: %w", err)
		}
		return
	}

	log.Printf("App: Created and broadcast signed order: %s", orderID)

	if cmd.ResponseCh != nil {
		cmd.ResponseCh <- orderID
	}
```

---

### Step 5: Update Proposal Broadcast to Use Signed Messages

**File**: `node/app.go`

**Function**: `handleAppCommand()` - "propose" case

**Similar changes**: Replace `BroadcastMessage()` with `broadcastSignedMessage()`

---

### Step 6: Implement Order Details Encryption

**File**: `node/app.go`

**Add new function**:
```go
// sendEncryptedOrderDetails encrypts and sends order details to a specific peer
func (app *BlackTraceApp) sendEncryptedOrderDetails(to PeerID, orderID OrderID) error {
	// Get order details
	app.ordersMux.RLock()
	order, exists := app.orders[orderID]
	app.ordersMux.RUnlock()

	if !exists {
		return fmt.Errorf("order not found: %s", orderID)
	}

	// Get recipient's public key
	app.peerKeysMux.RLock()
	recipientPubKeyBytes, ok := app.peerKeys[to]
	app.peerKeysMux.RUnlock()

	if !ok {
		return fmt.Errorf("recipient public key not cached for peer: %s", to)
	}

	// Parse recipient's public key
	recipientPubKey, err := ParsePublicKey(recipientPubKeyBytes)
	if err != nil {
		return fmt.Errorf("failed to parse recipient public key: %w", err)
	}

	// Create order details to encrypt
	details := OrderDetails{
		OrderID:    orderID,
		OrderType:  order.OrderType,
		Amount:     1000, // Get from stored details
		MinPrice:   450,  // Get from stored details
		MaxPrice:   470,  // Get from stored details
		Stablecoin: order.Stablecoin,
	}

	// Marshal details to JSON
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		return fmt.Errorf("failed to marshal details: %w", err)
	}

	// Encrypt with recipient's public key
	encrypted, err := ECIESEncrypt(recipientPubKey, detailsJSON)
	if err != nil {
		return fmt.Errorf("failed to encrypt order details: %w", err)
	}

	// Serialize encrypted message
	encryptedPayload := SerializeECIESMessage(encrypted)

	// Create encrypted message
	encryptedMsg := EncryptedOrderDetailsMessage{
		OrderID:          orderID,
		EncryptedPayload: encryptedPayload,
	}

	// Send as signed message
	if err := app.sendSignedMessage(to, "encrypted_order_details", encryptedMsg); err != nil {
		return fmt.Errorf("failed to send encrypted details: %w", err)
	}

	log.Printf("App: Sent encrypted order details for %s to %s (payload size: %d bytes)",
		orderID, to, len(encryptedPayload))

	return nil
}
```

**Update** `handleMessagePayload()` to handle encrypted details:
```go
case "encrypted_order_details":
	var encMsg EncryptedOrderDetailsMessage
	if err := json.Unmarshal(payload, &encMsg); err != nil {
		log.Printf("Failed to unmarshal encrypted order details: %v", err)
		return
	}

	// Decrypt if we have crypto manager
	if app.cryptoMgr == nil {
		log.Printf("Cannot decrypt order details: CryptoManager not initialized")
		return
	}

	// Deserialize ECIES message
	eciesMsg, err := DeserializeECIESMessage(encMsg.EncryptedPayload)
	if err != nil {
		log.Printf("Failed to deserialize ECIES message: %v", err)
		return
	}

	// Decrypt
	decrypted, err := app.cryptoMgr.ECIESDecrypt(eciesMsg)
	if err != nil {
		log.Printf("Failed to decrypt order details: %v", err)
		return
	}

	// Parse decrypted details
	var details OrderDetails
	if err := json.Unmarshal(decrypted, &details); err != nil {
		log.Printf("Failed to unmarshal decrypted details: %v", err)
		return
	}

	log.Printf("App: Decrypted order details for %s: Amount=%d, Price=%d-%d %s",
		details.OrderID, details.Amount, details.MinPrice, details.MaxPrice, details.Stablecoin)

	// Store decrypted details or display to user
	// ...
```

---

## Testing Plan

### Test 1: Basic Signature Verification

```bash
# Start two nodes
./blacktrace node --port 19000 --api-port 8080 &
./blacktrace node --port 19001 --api-port 8081 &

# Register and login on both
curl -X POST localhost:8080/auth/register -d '{"username":"alice","password":"test123"}'
curl -X POST localhost:8080/auth/login -d '{"username":"alice","password":"test123"}'

curl -X POST localhost:8081/auth/register -d '{"username":"bob","password":"test456"}'
curl -X POST localhost:8081/auth/login -d '{"username":"bob","password":"test456"}'

# Create order on node 1 (should be signed)
SESSION_A=$(...)
curl -X POST localhost:8080/orders/create -d "{\"session_id\":\"$SESSION_A\",\"amount\":1000,...}"

# Check node 2 logs for signature verification
tail -f /tmp/node-b.log | grep "Verified signed message"
```

### Test 2: Order Details Encryption

```bash
# After order creation, request details
curl -X POST localhost:8081/negotiate/request -d '{"order_id":"order_XXX"}'

# Check logs for encryption confirmation
tail -f /tmp/node-a.log | grep "Sent encrypted order details"
tail -f /tmp/node-b.log | grep "Decrypted order details"
```

### Test 3: Tampering Detection

Manually modify a signed message and send it - should be rejected.

---

## Documentation Updates

### Update `docs/ARCHITECTURE.md`

Add section under Phase 2:

```markdown
### Phase 2B: Message Encryption and Signatures (Current)
- [x] Cryptographic foundation (ECIES + ECDSA)
- [x] Message signing for all broadcasts
- [x] Signature verification on receive
- [x] Order details encryption (ECIES)
- [x] Peer public key caching
- [x] Tampering detection
```

### Update `docs/CLI_TESTING.md`

Add section showing how to verify encryption in logs:

```markdown
## Verifying Message Encryption

After running the two-node demo, check the logs to verify encryption:

```bash
# Node A logs (sender)
grep "Broadcasting signed message" /tmp/node-a.log
grep "Sent encrypted order details" /tmp/node-a.log

# Node B logs (receiver)
grep "Verified signed message" /tmp/node-b.log
grep "Decrypted order details" /tmp/node-b.log
```
```

---

## Files to Modify

1. ✅ `node/types.go` - Message types (DONE)
2. ✅ `node/app.go` - App structure (DONE)
3. ⏳ `node/app.go` - Message handlers (IN PROGRESS)
4. ⏳ `node/api.go` - Login handler (PENDING)
5. ⏳ `docs/ARCHITECTURE.md` - Documentation (PENDING)
6. ⏳ `docs/CLI_TESTING.md` - Testing guide (PENDING)

---

## Estimated Completion

- **Lines of code to add/modify**: ~400-500 lines
- **Files to touch**: 4 files
- **Testing time**: 30-60 minutes
- **Total time**: 2-3 hours

---

## Next Session Plan

1. Implement all message handler updates in `app.go`
2. Update `api.go` login handler
3. Update documentation
4. Run comprehensive tests
5. Create commit with full integration

---

**Last Updated**: 2025-11-19
**Status**: Foundation complete, integration 40% done
