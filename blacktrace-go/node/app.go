package node

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

// BlackTraceApp is the main application
type BlackTraceApp struct {
	network   *NetworkManager
	authMgr   *AuthManager
	cryptoMgr *CryptoManager // Initialized when first user logs in (one node = one user)
	orders    map[OrderID]*OrderAnnouncement
	ordersMux sync.RWMutex

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
	Amount     uint64
	Stablecoin StablecoinType
	MinPrice   uint64
	MaxPrice   uint64

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
		network:      nm,
		authMgr:      authMgr,
		cryptoMgr:    nil, // Initialized on first user login
		orders:       make(map[OrderID]*OrderAnnouncement),
		proposals:    make(map[ProposalID]*Proposal),
		peerKeys:     make(map[PeerID][]byte),
		appCommandCh: make(chan AppCommand, 100),
		shutdownCh:   make(chan struct{}),
	}

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

		log.Printf("App: Received order details: %s", details.OrderID)

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

		// Store decrypted details or display to user
		// TODO: Add to a separate map for decrypted order details

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

		// TODO: Update proposal status and move to settlement phase
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
		orderID := app.createOrder(cmd.Amount, cmd.Stablecoin, cmd.MinPrice, cmd.MaxPrice)
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
func (app *BlackTraceApp) createOrder(amount uint64, stablecoin StablecoinType, minPrice, maxPrice uint64) OrderID {
	orderID := NewOrderID()

	announcement := &OrderAnnouncement{
		OrderID:          orderID,
		OrderType:        OrderTypeSell,
		Stablecoin:       stablecoin,
		MakerID:          app.GetPeerID(), // NEW: Include maker ID for encrypted proposals
		EncryptedDetails: []byte{},        // Simplified
		ProofCommitment:  []byte{},        // Would call Rust crypto here
		Timestamp:        time.Now().Unix(),
		Expiry:           time.Now().Add(1 * time.Hour).Unix(),
	}

	app.ordersMux.Lock()
	app.orders[orderID] = announcement
	app.ordersMux.Unlock()

	// Broadcast SIGNED announcement
	if err := app.broadcastSignedMessage("order_announcement", announcement); err != nil {
		log.Printf("Failed to broadcast order announcement: %v", err)
		return orderID
	}

	log.Printf("App: Created and broadcast signed order: %s", orderID)

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

	details := OrderDetails{
		OrderID:    orderID,
		OrderType:  order.OrderType,
		Amount:     10000, // Simplified
		MinPrice:   450,
		MaxPrice:   470,
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

	// Create order details to encrypt
	details := OrderDetails{
		OrderID:    orderID,
		OrderType:  order.OrderType,
		Amount:     10000, // TODO: Get from stored details
		MinPrice:   450,   // TODO: Get from stored details
		MaxPrice:   470,   // TODO: Get from stored details
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
func (app *BlackTraceApp) CreateOrder(amount uint64, stablecoin StablecoinType, minPrice, maxPrice uint64) OrderID {
	responseCh := make(chan interface{})

	app.appCommandCh <- AppCommand{
		Type:       "create_order",
		Amount:     amount,
		Stablecoin: stablecoin,
		MinPrice:   minPrice,
		MaxPrice:   maxPrice,
		ResponseCh: responseCh,
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

	// Update status to accepted
	proposal.Status = ProposalStatusAccepted
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

	// TODO: In a real implementation, this would also:
	// 1. Initiate HTLC setup
	// 2. Move to settlement phase

	return nil
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
}

// GetAuthManager returns the authentication manager
func (app *BlackTraceApp) GetAuthManager() *AuthManager {
	return app.authMgr
}
