package node

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"sync"
	"time"
)

// BlackTraceApp is the main application
type BlackTraceApp struct {
	network      *NetworkManager
	authMgr      *AuthManager
	cryptoMgr    *CryptoManager // Initialized when first user logs in (one node = one user)
	settlementMgr *SettlementManager // Phase 3: NATS-based settlement coordination
	orders       map[OrderID]*OrderAnnouncement
	ordersMux    sync.RWMutex

	// Order details cache (for own orders and received details) - DEMO/UI only
	orderDetails    map[OrderID]*OrderDetails
	orderDetailsMux sync.RWMutex

	// Proposal tracking - maps ProposalID to Proposal
	proposals    map[ProposalID]*Proposal
	proposalsMux sync.RWMutex

	// Peer public key cache for signature verification
	peerKeys    map[PeerID][]byte // Maps peer ID to their public key
	peerKeysMux sync.RWMutex

	// Channels for inter-component communication
	appCommandCh chan AppCommand
	shutdownCh   chan struct{}
}

// AppCommand represents commands to the application
type AppCommand struct {
	Type string // "create_order", "request_details", "propose", etc.

	// Order creation
	Amount        uint64
	Stablecoin    StablecoinType
	MinPrice      uint64
	MaxPrice      uint64
	TakerUsername string // Optional: username of specific taker to encrypt for

	// Negotiation
	OrderID OrderID
	Price   uint64

	// Response channel for synchronous operations
	ResponseCh chan interface{}
}

// NewBlackTraceApp creates a new application
func NewBlackTraceApp(port int) (*BlackTraceApp, error) {
	nm, err := NewNetworkManager(port)
	if err != nil {
		return nil, err
	}

	// Create auth manager with 24-hour session expiration
	authMgr := NewAuthManager(24 * time.Hour)

	app := &BlackTraceApp{
		network:       nm,
		authMgr:       authMgr,
		cryptoMgr:     nil, // Initialized on first user login
		settlementMgr: nil, // Initialized below after app is created
		orders:        make(map[OrderID]*OrderAnnouncement),
		orderDetails:  make(map[OrderID]*OrderDetails),
		proposals:     make(map[ProposalID]*Proposal),
		peerKeys:      make(map[PeerID][]byte),
		appCommandCh:  make(chan AppCommand, 100),
		shutdownCh:    make(chan struct{}),
	}

	// Initialize settlement manager after app is created (needs app reference for subscriptions)
	settlementMgr, err := NewSettlementManager(app)
	if err != nil {
		log.Printf("Warning: Failed to initialize settlement manager: %v", err)
		// Continue without settlement service
		settlementMgr = &SettlementManager{enabled: false, app: app}
	}
	app.settlementMgr = settlementMgr

	return app, nil
}

// SetCryptoManager sets the crypto manager (called after user login)
func (app *BlackTraceApp) SetCryptoManager(cm *CryptoManager) {
	app.cryptoMgr = cm
	log.Printf("App: CryptoManager initialized for message signing and encryption")
}

// Run starts the application (non-blocking)
func (app *BlackTraceApp) Run() {
	// Start network manager
	app.network.Run()

	// Start event processor
	go app.processEvents()

	// Start command processor
	go app.processCommands()
}

// processEvents handles network events
// THIS IS WHERE THE MAGIC HAPPENS - NO MUTEXES NEEDED!
func (app *BlackTraceApp) processEvents() {
	for {
		select {
		case <-app.shutdownCh:
			return
		case event := <-app.network.EventChan():
			app.handleNetworkEvent(event)
		}
	}
}

// processCommands handles application commands
func (app *BlackTraceApp) processCommands() {
	for {
		select {
		case <-app.shutdownCh:
			return
		case cmd := <-app.appCommandCh:
			app.handleAppCommand(cmd)
		}
	}
}

// handleNetworkEvent processes a network event
func (app *BlackTraceApp) handleNetworkEvent(event NetworkEvent) {
	switch event.Type {
	case "peer_connected":
		log.Printf("App: Peer connected: %s", event.From)

	case "peer_disconnected":
		log.Printf("App: Peer disconnected: %s", event.From)

	case "message_received":
		app.handleMessage(event.From, event.Data)
	}
}

// handleMessage processes a received message
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

	case "order_request":
		var orderID OrderID
		if err := json.Unmarshal(payload, &orderID); err != nil {
			log.Printf("Failed to unmarshal order request: %v", err)
			return
		}

		log.Printf("App: Received order request: %s from %s", orderID, from)

		// Send ENCRYPTED order details back (Phase 2B - ECIES encryption)
		if err := app.sendEncryptedOrderDetails(from, orderID); err != nil {
			log.Printf("Failed to send encrypted order details: %v", err)
			// Fallback to unencrypted if encryption fails
			log.Printf("Falling back to unencrypted order details")
			app.sendOrderDetails(from, orderID)
		}

	case "order_details":
		var details OrderDetails
		if err := json.Unmarshal(payload, &details); err != nil {
			log.Printf("Failed to unmarshal order details: %v", err)
			return
		}

		log.Printf("App: Received order details: %s (Amount: %d, Min: %d, Max: %d)",
			details.OrderID, details.Amount, details.MinPrice, details.MaxPrice)

		// Store the received order details
		app.orderDetailsMux.Lock()
		app.orderDetails[details.OrderID] = &details
		app.orderDetailsMux.Unlock()

	case "proposal":
		var proposal Proposal
		if err := json.Unmarshal(payload, &proposal); err != nil {
			log.Printf("Failed to unmarshal proposal: %v", err)
			return
		}

		log.Printf("App: Received signed proposal: %s from %s", proposal.ProposalID, from)

		// Store the proposal
		app.proposalsMux.Lock()
		app.proposals[proposal.ProposalID] = &proposal
		app.proposalsMux.Unlock()

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

		// Store the decrypted order details
		app.orderDetailsMux.Lock()
		app.orderDetails[details.OrderID] = &details
		app.orderDetailsMux.Unlock()

	case "encrypted_proposal":
		var encMsg EncryptedProposalMessage
		if err := json.Unmarshal(payload, &encMsg); err != nil {
			log.Printf("Failed to unmarshal encrypted proposal: %v", err)
			return
		}

		// Decrypt if we have crypto manager
		if app.cryptoMgr == nil {
			log.Printf("Cannot decrypt proposal: CryptoManager not initialized")
			return
		}

		// Deserialize ECIES message
		eciesMsg, err := DeserializeECIESMessage(encMsg.EncryptedPayload)
		if err != nil {
			log.Printf("Failed to deserialize ECIES proposal message: %v", err)
			return
		}

		// Decrypt
		decrypted, err := app.cryptoMgr.ECIESDecrypt(eciesMsg)
		if err != nil {
			log.Printf("Failed to decrypt proposal: %v", err)
			return
		}

		// Parse decrypted proposal
		var proposal Proposal
		if err := json.Unmarshal(decrypted, &proposal); err != nil {
			log.Printf("Failed to unmarshal decrypted proposal: %v", err)
			return
		}

		log.Printf("App: Decrypted proposal %s from %s: Price=$%d, Amount=%d (frontrunning prevented)",
			proposal.ProposalID, from, proposal.Price, proposal.Amount)

		// Store the proposal
		app.proposalsMux.Lock()
		app.proposals[proposal.ProposalID] = &proposal
		app.proposalsMux.Unlock()

	case "encrypted_acceptance":
		var encMsg EncryptedAcceptanceMessage
		if err := json.Unmarshal(payload, &encMsg); err != nil {
			log.Printf("Failed to unmarshal encrypted acceptance: %v", err)
			return
		}

		// Decrypt if we have crypto manager
		if app.cryptoMgr == nil {
			log.Printf("Cannot decrypt acceptance: CryptoManager not initialized")
			return
		}

		// Deserialize ECIES message
		eciesMsg, err := DeserializeECIESMessage(encMsg.EncryptedPayload)
		if err != nil {
			log.Printf("Failed to deserialize ECIES acceptance message: %v", err)
			return
		}

		// Decrypt
		decrypted, err := app.cryptoMgr.ECIESDecrypt(eciesMsg)
		if err != nil {
			log.Printf("Failed to decrypt acceptance: %v", err)
			return
		}

		// Parse decrypted acceptance
		var acceptance map[string]interface{}
		if err := json.Unmarshal(decrypted, &acceptance); err != nil {
			log.Printf("Failed to unmarshal decrypted acceptance: %v", err)
			return
		}

		log.Printf("App: Decrypted acceptance for proposal %s: Status=%s (value leakage prevented)",
			acceptance["proposal_id"], acceptance["status"])

		// Update proposal status to accepted
		proposalIDStr, ok := acceptance["proposal_id"].(string)
		if !ok {
			log.Printf("Invalid proposal_id in acceptance message")
			return
		}
		proposalID := ProposalID(proposalIDStr)

		app.proposalsMux.Lock()
		if proposal, exists := app.proposals[proposalID]; exists {
			proposal.Status = ProposalStatusAccepted
			log.Printf("App: Updated proposal %s status to Accepted", proposalID)
		}
		app.proposalsMux.Unlock()

	case "rejection":
		var rejection map[string]interface{}
		if err := json.Unmarshal(payload, &rejection); err != nil {
			log.Printf("Failed to unmarshal rejection: %v", err)
			return
		}

		proposalIDStr, ok := rejection["proposal_id"].(string)
		if !ok {
			log.Printf("Invalid proposal_id in rejection message")
			return
		}
		proposalID := ProposalID(proposalIDStr)

		log.Printf("App: Received rejection for proposal %s", proposalID)

		// Update proposal status to rejected
		app.proposalsMux.Lock()
		if proposal, exists := app.proposals[proposalID]; exists {
			proposal.Status = ProposalStatusRejected
			log.Printf("App: Updated proposal %s status to Rejected", proposalID)
		}
		app.proposalsMux.Unlock()
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

// handleAppCommand processes an application command
func (app *BlackTraceApp) handleAppCommand(cmd AppCommand) {
	switch cmd.Type {
	case "create_order":
		orderID := app.createOrder(cmd.Amount, cmd.Stablecoin, cmd.MinPrice, cmd.MaxPrice, cmd.TakerUsername)
		if cmd.ResponseCh != nil {
			cmd.ResponseCh <- orderID
		}

	case "list_orders":
		app.ordersMux.RLock()
		orders := make([]*OrderAnnouncement, 0, len(app.orders))
		for _, order := range app.orders {
			orders = append(orders, order)
		}
		app.ordersMux.RUnlock()

		if cmd.ResponseCh != nil {
			cmd.ResponseCh <- orders
		}

	case "request_details":
		app.requestOrderDetails(cmd.OrderID)

	case "propose":
		app.proposePrice(cmd.OrderID, cmd.Price, cmd.Amount)
	}
}

// createOrder creates and broadcasts a new order
func (app *BlackTraceApp) createOrder(amount uint64, stablecoin StablecoinType, minPrice, maxPrice uint64, takerUsername string) OrderID {
	orderID := NewOrderID()

	// Prepare order details
	details := &OrderDetails{
		OrderID:    orderID,
		OrderType:  OrderTypeSell,
		Amount:     amount,
		MinPrice:   minPrice,
		MaxPrice:   maxPrice,
		Stablecoin: stablecoin,
	}

	// Store order details locally
	app.orderDetailsMux.Lock()
	app.orderDetails[orderID] = details
	app.orderDetailsMux.Unlock()

	// Prepare announcement
	announcement := &OrderAnnouncement{
		OrderID:          orderID,
		OrderType:        OrderTypeSell,
		Stablecoin:       stablecoin,
		MakerID:          app.GetPeerID(), // Include maker ID for encrypted proposals
		EncryptedDetails: []byte{},        // Will be populated if taker is specified
		ProofCommitment:  []byte{},        // Would call Rust crypto here
		Timestamp:        time.Now().Unix(),
		Expiry:           time.Now().Add(1 * time.Hour).Unix(),
	}

	// If a specific taker is specified, encrypt order details with their public key
	if takerUsername != "" {
		// Retrieve taker's public key from identity storage
		takerInfo, err := GetUserPublicKey(takerUsername)
		if err != nil {
			log.Printf("Warning: Failed to get public key for taker %s: %v. Creating unencrypted order.", takerUsername, err)
		} else {
			// Reconstruct taker's ECDSA public key
			takerPubKey := &ecdsa.PublicKey{
				Curve: elliptic.P256(),
				X:     new(big.Int).SetBytes(takerInfo.PublicKeyX),
				Y:     new(big.Int).SetBytes(takerInfo.PublicKeyY),
			}

			// Encrypt order details using ECIES
			detailsJSON, err := json.Marshal(details)
			if err != nil {
				log.Printf("Warning: Failed to marshal order details: %v", err)
			} else {
				encryptedMsg, err := ECIESEncrypt(takerPubKey, detailsJSON)
				if err != nil {
					log.Printf("Warning: Failed to encrypt order details for taker %s: %v", takerUsername, err)
				} else {
					announcement.EncryptedDetails = SerializeECIESMessage(encryptedMsg)
					log.Printf("App: Encrypted order details for taker: %s", takerUsername)
				}
			}
		}
	}

	app.ordersMux.Lock()
	app.orders[orderID] = announcement
	app.ordersMux.Unlock()

	// Broadcast SIGNED announcement
	if err := app.broadcastSignedMessage("order_announcement", announcement); err != nil {
		log.Printf("Failed to broadcast order announcement: %v", err)
		return orderID
	}

	if takerUsername != "" {
		log.Printf("App: Created and broadcast order %s encrypted for taker: %s", orderID, takerUsername)
	} else {
		log.Printf("App: Created and broadcast signed order: %s", orderID)
	}

	return orderID
}

// requestOrderDetails requests details for an order
func (app *BlackTraceApp) requestOrderDetails(orderID OrderID) {
	data, _ := MarshalMessage("order_request", orderID)

	// Send to first peer (simplified - should route to order owner)
	app.network.CommandChan() <- NetworkCommand{
		Type: "broadcast",
		Data: data,
	}

	log.Printf("App: Requested details for order: %s", orderID)
}

// sendOrderDetails sends order details to a peer
func (app *BlackTraceApp) sendOrderDetails(to PeerID, orderID OrderID) {
	app.ordersMux.RLock()
	order, ok := app.orders[orderID]
	app.ordersMux.RUnlock()

	if !ok {
		log.Printf("App: Order %s not found", orderID)
		return
	}

	// Get actual order details from storage
	app.orderDetailsMux.RLock()
	storedDetails, hasDetails := app.orderDetails[orderID]
	app.orderDetailsMux.RUnlock()

	if !hasDetails {
		log.Printf("App: Order details not found for order: %s", orderID)
		return
	}

	details := OrderDetails{
		OrderID:    orderID,
		OrderType:  order.OrderType,
		Amount:     storedDetails.Amount,
		MinPrice:   storedDetails.MinPrice,
		MaxPrice:   storedDetails.MaxPrice,
		Stablecoin: order.Stablecoin,
	}

	data, _ := MarshalMessage("order_details", details)
	app.network.CommandChan() <- NetworkCommand{
		Type: "send",
		To:   to,
		Data: data,
	}

	log.Printf("App: Sent order details to %s", to)
}

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

	// Get actual order details from storage
	app.orderDetailsMux.RLock()
	storedDetails, hasDetails := app.orderDetails[orderID]
	app.orderDetailsMux.RUnlock()

	if !hasDetails {
		return fmt.Errorf("order details not found for order: %s", orderID)
	}

	// Create order details to encrypt (using actual stored values)
	details := OrderDetails{
		OrderID:    orderID,
		OrderType:  order.OrderType,
		Amount:     storedDetails.Amount,
		MinPrice:   storedDetails.MinPrice,
		MaxPrice:   storedDetails.MaxPrice,
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

// sendEncryptedProposal encrypts and sends a proposal to the maker (prevents frontrunning)
func (app *BlackTraceApp) sendEncryptedProposal(makerID PeerID, proposal Proposal) error {
	// Get maker's public key
	app.peerKeysMux.RLock()
	makerPubKeyBytes, ok := app.peerKeys[makerID]
	app.peerKeysMux.RUnlock()

	if !ok {
		return fmt.Errorf("maker public key not cached for peer: %s", makerID)
	}

	// Parse maker's public key
	makerPubKey, err := ParsePublicKey(makerPubKeyBytes)
	if err != nil {
		return fmt.Errorf("failed to parse maker public key: %w", err)
	}

	// Marshal proposal to JSON
	proposalJSON, err := json.Marshal(proposal)
	if err != nil {
		return fmt.Errorf("failed to marshal proposal: %w", err)
	}

	// Encrypt with maker's public key
	encrypted, err := ECIESEncrypt(makerPubKey, proposalJSON)
	if err != nil {
		return fmt.Errorf("failed to encrypt proposal: %w", err)
	}

	// Serialize encrypted message
	encryptedPayload := SerializeECIESMessage(encrypted)

	// Create encrypted proposal message
	encryptedMsg := EncryptedProposalMessage{
		OrderID:          proposal.OrderID,
		EncryptedPayload: encryptedPayload,
	}

	// Send as signed message to maker only (not broadcast)
	if err := app.sendSignedMessage(makerID, "encrypted_proposal", encryptedMsg); err != nil {
		return fmt.Errorf("failed to send encrypted proposal: %w", err)
	}

	log.Printf("App: Sent encrypted proposal %s to maker %s (prevents frontrunning)",
		proposal.ProposalID, makerID)

	return nil
}

// sendEncryptedAcceptance encrypts and sends acceptance to proposer (prevents value leakage)
func (app *BlackTraceApp) sendEncryptedAcceptance(proposerID PeerID, proposal *Proposal) error {
	// Get proposer's public key
	app.peerKeysMux.RLock()
	proposerPubKeyBytes, ok := app.peerKeys[proposerID]
	app.peerKeysMux.RUnlock()

	if !ok {
		return fmt.Errorf("proposer public key not cached for peer: %s", proposerID)
	}

	// Parse proposer's public key
	proposerPubKey, err := ParsePublicKey(proposerPubKeyBytes)
	if err != nil {
		return fmt.Errorf("failed to parse proposer public key: %w", err)
	}

	// Create acceptance details (include full proposal for context)
	acceptanceDetails := map[string]interface{}{
		"proposal_id": proposal.ProposalID,
		"order_id":    proposal.OrderID,
		"price":       proposal.Price,
		"amount":      proposal.Amount,
		"status":      "accepted",
		"timestamp":   time.Now().Unix(),
	}

	// Marshal acceptance to JSON
	acceptanceJSON, err := json.Marshal(acceptanceDetails)
	if err != nil {
		return fmt.Errorf("failed to marshal acceptance: %w", err)
	}

	// Encrypt with proposer's public key
	encrypted, err := ECIESEncrypt(proposerPubKey, acceptanceJSON)
	if err != nil {
		return fmt.Errorf("failed to encrypt acceptance: %w", err)
	}

	// Serialize encrypted message
	encryptedPayload := SerializeECIESMessage(encrypted)

	// Create encrypted acceptance message
	encryptedMsg := EncryptedAcceptanceMessage{
		ProposalID:       proposal.ProposalID,
		EncryptedPayload: encryptedPayload,
	}

	// Send as signed message to proposer only (not broadcast)
	if err := app.sendSignedMessage(proposerID, "encrypted_acceptance", encryptedMsg); err != nil {
		return fmt.Errorf("failed to send encrypted acceptance: %w", err)
	}

	log.Printf("App: Sent encrypted acceptance for proposal %s to proposer %s (prevents value leakage)",
		proposal.ProposalID, proposerID)

	return nil
}

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
		app.network.CommandChan() <- NetworkCommand{
			Type: "broadcast",
			Data: data,
		}
		return nil
	}

	// Sign the message
	data, err := MarshalSignedMessage(msgType, payload, app.cryptoMgr)
	if err != nil {
		return fmt.Errorf("failed to sign message: %w", err)
	}

	log.Printf("App: Broadcasting signed message (type: %s, size: %d bytes)", msgType, len(data))
	app.network.CommandChan() <- NetworkCommand{
		Type: "broadcast",
		Data: data,
	}
	return nil
}

// sendSignedMessage signs and sends a message to a specific peer
func (app *BlackTraceApp) sendSignedMessage(to PeerID, msgType string, payload interface{}) error {
	if app.cryptoMgr == nil {
		log.Printf("Warning: CryptoManager not initialized, sending unsigned message")
		data, err := MarshalMessage(msgType, payload)
		if err != nil {
			return err
		}
		app.network.CommandChan() <- NetworkCommand{
			Type: "send",
			To:   to,
			Data: data,
		}
		return nil
	}

	data, err := MarshalSignedMessage(msgType, payload, app.cryptoMgr)
	if err != nil {
		return fmt.Errorf("failed to sign message: %w", err)
	}

	log.Printf("App: Sending signed message to %s (type: %s)", to, msgType)
	app.network.CommandChan() <- NetworkCommand{
		Type: "send",
		To:   to,
		Data: data,
	}
	return nil
}

// proposePrice proposes a price for an order
func (app *BlackTraceApp) proposePrice(orderID OrderID, price, amount uint64) {
	proposalID := NewProposalID(orderID)

	proposal := Proposal{
		ProposalID: proposalID,
		OrderID:    orderID,
		Price:      price,
		Amount:     amount,
		ProposerID: app.GetPeerID(),
		Status:     ProposalStatusPending,
		Timestamp:  time.Now(),
	}

	// Store the proposal locally
	app.proposalsMux.Lock()
	app.proposals[proposalID] = &proposal
	app.proposalsMux.Unlock()

	// Get maker ID from the order
	app.ordersMux.RLock()
	order, exists := app.orders[orderID]
	app.ordersMux.RUnlock()

	if !exists {
		log.Printf("Failed to send proposal: order %s not found", orderID)
		return
	}

	// Send ENCRYPTED proposal to maker only (prevents frontrunning)
	if err := app.sendEncryptedProposal(order.MakerID, proposal); err != nil {
		log.Printf("Failed to send encrypted proposal: %v", err)
		// Fallback to public broadcast if encryption fails
		log.Printf("Falling back to public proposal broadcast (WARNING: frontrunning possible)")
		if err := app.broadcastSignedMessage("proposal", proposal); err != nil {
			log.Printf("Failed to broadcast proposal: %v", err)
			return
		}
	}

	log.Printf("App: Proposed price $%d for order %s (Proposal ID: %s)", price, orderID, proposalID)
}

// CreateOrder creates an order (synchronous API for external use)
func (app *BlackTraceApp) CreateOrder(amount uint64, stablecoin StablecoinType, minPrice, maxPrice uint64, takerUsername string) OrderID {
	responseCh := make(chan interface{})

	app.appCommandCh <- AppCommand{
		Type:          "create_order",
		Amount:        amount,
		Stablecoin:    stablecoin,
		MinPrice:      minPrice,
		MaxPrice:      maxPrice,
		TakerUsername: takerUsername,
		ResponseCh:    responseCh,
	}

	result := <-responseCh
	return result.(OrderID)
}

// ListOrders returns all known orders (synchronous API)
func (app *BlackTraceApp) ListOrders() []*OrderAnnouncement {
	responseCh := make(chan interface{})

	app.appCommandCh <- AppCommand{
		Type:       "list_orders",
		ResponseCh: responseCh,
	}

	result := <-responseCh
	return result.([]*OrderAnnouncement)
}

// RequestOrderDetails requests order details (async)
func (app *BlackTraceApp) RequestOrderDetails(orderID OrderID) {
	app.appCommandCh <- AppCommand{
		Type:    "request_details",
		OrderID: orderID,
	}
}

// ProposePrice proposes a price (async)
func (app *BlackTraceApp) ProposePrice(orderID OrderID, price, amount uint64) {
	app.appCommandCh <- AppCommand{
		Type:    "propose",
		OrderID: orderID,
		Price:   price,
		Amount:  amount,
	}
}

// ListProposals returns all proposals for a given order
func (app *BlackTraceApp) ListProposals(orderID OrderID) []*Proposal {
	app.proposalsMux.RLock()
	defer app.proposalsMux.RUnlock()

	proposals := make([]*Proposal, 0)
	for _, proposal := range app.proposals {
		if proposal.OrderID == orderID {
			proposals = append(proposals, proposal)
		}
	}

	return proposals
}

// AcceptProposal accepts a specific proposal
func (app *BlackTraceApp) AcceptProposal(proposalID ProposalID) error {
	app.proposalsMux.Lock()
	proposal, ok := app.proposals[proposalID]
	if !ok {
		app.proposalsMux.Unlock()
		return fmt.Errorf("proposal %s not found", proposalID)
	}

	// Update status to accepted and initialize settlement status
	proposal.Status = ProposalStatusAccepted
	readyStatus := SettlementStatusReady
	proposal.SettlementStatus = &readyStatus
	app.proposalsMux.Unlock()

	log.Printf("App: Accepted proposal %s (Price: $%d, Amount: %d)", proposalID, proposal.Price, proposal.Amount)

	// Send ENCRYPTED acceptance to proposer only (prevents value leakage)
	if err := app.sendEncryptedAcceptance(proposal.ProposerID, proposal); err != nil {
		log.Printf("Failed to send encrypted acceptance: %v", err)
		// Fallback to public broadcast if encryption fails
		log.Printf("Falling back to public acceptance broadcast (WARNING: value leakage possible)")
		if err := app.broadcastSignedMessage("acceptance", map[string]interface{}{
			"proposal_id": proposal.ProposalID,
			"status":      "accepted",
		}); err != nil {
			log.Printf("Failed to broadcast acceptance: %v", err)
		}
	}

	// Phase 3: Publish settlement request to NATS for HTLC creation
	if app.settlementMgr.IsEnabled() {
		// Get order details
		app.ordersMux.RLock()
		order, exists := app.orders[proposal.OrderID]
		app.ordersMux.RUnlock()

		if !exists {
			log.Printf("Warning: Order %s not found, cannot initiate settlement", proposal.OrderID)
			return nil
		}

		// Create settlement request
		settlementReq := SettlementRequest{
			ProposalID:      string(proposalID),
			OrderID:         string(proposal.OrderID),
			MakerID:         string(app.GetPeerID()),
			TakerID:         string(proposal.ProposerID),
			Amount:          proposal.Amount,
			Price:           proposal.Price,
			Stablecoin:      string(order.Stablecoin),
			SettlementChain: "ztarknet", // Default for now, will be from proposal in future
			Timestamp:       time.Now(),
		}

		// Publish to NATS for Rust settlement service
		if err := app.settlementMgr.PublishSettlementRequest(settlementReq); err != nil {
			log.Printf("Warning: Failed to publish settlement request: %v", err)
			// Continue anyway - this is not critical for acceptance
		} else {
			log.Printf("Settlement: Request published to NATS (will be picked up by Rust service)")
		}
	}

	return nil
}

// RejectProposal rejects a specific proposal
func (app *BlackTraceApp) RejectProposal(proposalID ProposalID) error {
	app.proposalsMux.Lock()
	proposal, ok := app.proposals[proposalID]
	if !ok {
		app.proposalsMux.Unlock()
		return fmt.Errorf("proposal %s not found", proposalID)
	}

	// Update status to rejected
	proposal.Status = ProposalStatusRejected
	app.proposalsMux.Unlock()

	log.Printf("App: Rejected proposal %s (Price: $%d, Amount: %d)", proposalID, proposal.Price, proposal.Amount)

	// Notify proposer via P2P that proposal was rejected
	if err := app.broadcastSignedMessage("rejection", map[string]interface{}{
		"proposal_id": proposal.ProposalID,
		"status":      "rejected",
	}); err != nil {
		log.Printf("Failed to broadcast rejection: %v", err)
	}

	return nil
}

// LockZEC initiates settlement by locking ZEC (Alice's action)
func (app *BlackTraceApp) LockZEC(proposalID ProposalID) (SettlementStatus, error) {
	app.proposalsMux.Lock()
	proposal, ok := app.proposals[proposalID]
	if !ok {
		app.proposalsMux.Unlock()
		return "", fmt.Errorf("proposal %s not found", proposalID)
	}

	// Verify proposal is accepted
	if proposal.Status != ProposalStatusAccepted {
		app.proposalsMux.Unlock()
		return "", fmt.Errorf("proposal %s is not accepted (status: %s)", proposalID, proposal.Status)
	}

	// Set settlement status to alice_locked
	status := SettlementStatusAliceLocked
	proposal.SettlementStatus = &status
	app.proposalsMux.Unlock()

	log.Printf("Settlement: Alice locked %d ZEC for proposal %s", proposal.Amount, proposalID)

	// Publish settlement status update to NATS
	if app.settlementMgr.IsEnabled() {
		statusUpdate := map[string]interface{}{
			"proposal_id":       string(proposalID),
			"order_id":          string(proposal.OrderID),
			"settlement_status": string(status),
			"action":            "alice_lock_zec",
			"amount":            proposal.Amount,
			"timestamp":         time.Now(),
		}

		if err := app.settlementMgr.PublishSettlementStatusUpdate(statusUpdate); err != nil {
			log.Printf("Warning: Failed to publish settlement status update: %v", err)
		} else {
			log.Printf("Settlement: Status update published to NATS (alice_locked)")
		}
	}

	return status, nil
}

// LockUSDC completes settlement by locking USDC (Bob's action)
func (app *BlackTraceApp) LockUSDC(proposalID ProposalID) (SettlementStatus, error) {
	app.proposalsMux.Lock()
	proposal, ok := app.proposals[proposalID]
	if !ok {
		app.proposalsMux.Unlock()
		return "", fmt.Errorf("proposal %s not found", proposalID)
	}

	// Verify proposal is accepted and Alice has locked
	if proposal.Status != ProposalStatusAccepted {
		app.proposalsMux.Unlock()
		return "", fmt.Errorf("proposal %s is not accepted (status: %s)", proposalID, proposal.Status)
	}

	if proposal.SettlementStatus == nil || *proposal.SettlementStatus != SettlementStatusAliceLocked {
		app.proposalsMux.Unlock()
		currentStatus := "none"
		if proposal.SettlementStatus != nil {
			currentStatus = string(*proposal.SettlementStatus)
		}
		return "", fmt.Errorf("cannot lock USDC: Alice has not locked ZEC yet (current status: %s)", currentStatus)
	}

	// Set settlement status to both_locked
	status := SettlementStatusBothLocked
	proposal.SettlementStatus = &status
	app.proposalsMux.Unlock()

	totalUSDC := proposal.Amount * proposal.Price
	log.Printf("Settlement: Bob locked $%d USDC for proposal %s", totalUSDC, proposalID)
	log.Printf("Settlement: Both assets now locked - ready for claiming")

	// Publish settlement status update to NATS
	if app.settlementMgr.IsEnabled() {
		statusUpdate := map[string]interface{}{
			"proposal_id":       string(proposalID),
			"order_id":          string(proposal.OrderID),
			"settlement_status": string(status),
			"action":            "bob_lock_usdc",
			"amount_usdc":       totalUSDC,
			"timestamp":         time.Now(),
		}

		if err := app.settlementMgr.PublishSettlementStatusUpdate(statusUpdate); err != nil {
			log.Printf("Warning: Failed to publish settlement status update: %v", err)
		} else {
			log.Printf("Settlement: Status update published to NATS (both_locked)")
		}
	}

	return status, nil
}

// GetStatus returns the node's status
func (app *BlackTraceApp) GetStatus() NodeStatus {
	return app.network.GetStatus()
}

// GetPeerID returns this node's peer ID
func (app *BlackTraceApp) GetPeerID() PeerID {
	return PeerID(app.network.host.ID().String())
}

// ConnectToPeer connects to a peer by multiaddr
func (app *BlackTraceApp) ConnectToPeer(addr string) {
	app.network.CommandChan() <- NetworkCommand{
		Type: "connect",
		Addr: addr,
	}
}

// Shutdown gracefully shuts down the application
func (app *BlackTraceApp) Shutdown() {
	close(app.shutdownCh)
	app.network.CommandChan() <- NetworkCommand{
		Type: "shutdown",
	}
	// Close NATS connection
	app.settlementMgr.Close()
}

// GetAuthManager returns the authentication manager
func (app *BlackTraceApp) GetAuthManager() *AuthManager {
	return app.authMgr
}
