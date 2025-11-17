package node

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

// BlackTraceApp is the main application
type BlackTraceApp struct {
	network *NetworkManager
	orders  map[OrderID]*OrderAnnouncement
	ordersMux sync.RWMutex

	// Proposal tracking - maps ProposalID to Proposal
	proposals    map[ProposalID]*Proposal
	proposalsMux sync.RWMutex

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

	app := &BlackTraceApp{
		network:      nm,
		orders:       make(map[OrderID]*OrderAnnouncement),
		proposals:    make(map[ProposalID]*Proposal),
		appCommandCh: make(chan AppCommand, 100),
		shutdownCh:   make(chan struct{}),
	}

	return app, nil
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
	msg, err := UnmarshalMessage(data)
	if err != nil {
		log.Printf("Failed to unmarshal message: %v", err)
		return
	}

	switch msg.Type {
	case "order_announcement":
		var announcement OrderAnnouncement
		if err := json.Unmarshal(msg.Payload, &announcement); err != nil {
			log.Printf("Failed to unmarshal order announcement: %v", err)
			return
		}

		log.Printf("App: Received order announcement: %s", announcement.OrderID)

		app.ordersMux.Lock()
		app.orders[announcement.OrderID] = &announcement
		app.ordersMux.Unlock()

	case "order_request":
		var orderID OrderID
		if err := json.Unmarshal(msg.Payload, &orderID); err != nil {
			log.Printf("Failed to unmarshal order request: %v", err)
			return
		}

		log.Printf("App: Received order request: %s from %s", orderID, from)

		// Send order details back
		app.sendOrderDetails(from, orderID)

	case "order_details":
		var details OrderDetails
		if err := json.Unmarshal(msg.Payload, &details); err != nil {
			log.Printf("Failed to unmarshal order details: %v", err)
			return
		}

		log.Printf("App: Received order details: %s", details.OrderID)

	case "proposal":
		var proposal Proposal
		if err := json.Unmarshal(msg.Payload, &proposal); err != nil {
			log.Printf("Failed to unmarshal proposal: %v", err)
			return
		}

		log.Printf("App: Received proposal %s for %s: $%d from %s", proposal.ProposalID, proposal.OrderID, proposal.Price, proposal.ProposerID)

		// Store the proposal
		app.proposalsMux.Lock()
		app.proposals[proposal.ProposalID] = &proposal
		app.proposalsMux.Unlock()
	}
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
		EncryptedDetails: []byte{}, // Simplified
		ProofCommitment:  []byte{}, // Would call Rust crypto here
		Timestamp:        time.Now().Unix(),
		Expiry:           time.Now().Add(1 * time.Hour).Unix(),
	}

	app.ordersMux.Lock()
	app.orders[orderID] = announcement
	app.ordersMux.Unlock()

	// Broadcast to network
	data, _ := MarshalMessage("order_announcement", announcement)
	app.network.CommandChan() <- NetworkCommand{
		Type: "broadcast",
		Data: data,
	}

	log.Printf("App: Created and broadcast order: %s", orderID)

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

	// Broadcast to network
	data, _ := MarshalMessage("proposal", proposal)
	app.network.CommandChan() <- NetworkCommand{
		Type: "broadcast",
		Data: data,
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
	defer app.proposalsMux.Unlock()

	proposal, ok := app.proposals[proposalID]
	if !ok {
		return fmt.Errorf("proposal %s not found", proposalID)
	}

	// Update status to accepted
	proposal.Status = ProposalStatusAccepted

	log.Printf("App: Accepted proposal %s (Price: $%d, Amount: %d)", proposalID, proposal.Price, proposal.Amount)

	// TODO: In a real implementation, this would:
	// 1. Broadcast acceptance to the network
	// 2. Initiate HTLC setup
	// 3. Move to settlement phase

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
