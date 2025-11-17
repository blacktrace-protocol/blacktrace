package node

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
)

// APIServer provides HTTP API for CLI communication
type APIServer struct {
	app        *BlackTraceApp
	port       int
	server     *http.Server
	shutdownWg sync.WaitGroup
}

// NewAPIServer creates a new API server
func NewAPIServer(app *BlackTraceApp, port int) *APIServer {
	return &APIServer{
		app:  app,
		port: port,
	}
}

// Start starts the HTTP API server (non-blocking)
func (api *APIServer) Start() error {
	mux := http.NewServeMux()

	// Register endpoints
	mux.HandleFunc("/orders", api.handleOrders)
	mux.HandleFunc("/orders/create", api.handleCreateOrder)
	mux.HandleFunc("/negotiate/request", api.handleNegotiateRequest)
	mux.HandleFunc("/negotiate/propose", api.handleNegotiatePropose)
	mux.HandleFunc("/negotiate/proposals", api.handleListProposals)
	mux.HandleFunc("/negotiate/accept", api.handleAcceptProposal)
	mux.HandleFunc("/peers", api.handlePeers)
	mux.HandleFunc("/status", api.handleStatus)
	mux.HandleFunc("/health", api.handleHealth)

	api.server = &http.Server{
		Addr:    fmt.Sprintf(":%d", api.port),
		Handler: mux,
	}

	api.shutdownWg.Add(1)
	go func() {
		defer api.shutdownWg.Done()
		log.Printf("API server listening on port %d", api.port)
		if err := api.server.ListenAndServe(); err != http.ErrServerClosed {
			log.Printf("API server error: %v", err)
		}
	}()

	return nil
}

// Stop gracefully stops the API server
func (api *APIServer) Stop() {
	if api.server != nil {
		api.server.Close()
		api.shutdownWg.Wait()
	}
}

// Request/Response types

type CreateOrderRequest struct {
	Amount     uint64         `json:"amount"`
	Stablecoin StablecoinType `json:"stablecoin"`
	MinPrice   uint64         `json:"min_price"`
	MaxPrice   uint64         `json:"max_price"`
}

type CreateOrderResponse struct {
	OrderID OrderID `json:"order_id"`
}

type ListOrdersResponse struct {
	Orders []*OrderAnnouncement `json:"orders"`
}

type NegotiateRequestRequest struct {
	OrderID OrderID `json:"order_id"`
}

type NegotiateProposeRequest struct {
	OrderID OrderID `json:"order_id"`
	Price   uint64  `json:"price"`
	Amount  uint64  `json:"amount"`
}

type ListProposalsRequest struct {
	OrderID OrderID `json:"order_id"`
}

type ListProposalsResponse struct {
	Proposals []*Proposal `json:"proposals"`
}

type AcceptProposalRequest struct {
	ProposalID ProposalID `json:"proposal_id"`
}

type AcceptProposalResponse struct {
	Status string `json:"status"`
}

type PeersResponse struct {
	Peers []PeerInfo `json:"peers"`
}

type PeerInfo struct {
	ID      string `json:"id"`
	Address string `json:"address"`
}

type StatusResponse struct {
	PeerID     string `json:"peer_id"`
	ListenAddr string `json:"listen_addr"`
	PeerCount  int    `json:"peer_count"`
	OrderCount int    `json:"order_count"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

// Handlers

func (api *APIServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func (api *APIServer) handleCreateOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		api.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Amount == 0 {
		api.sendError(w, "Amount must be greater than 0", http.StatusBadRequest)
		return
	}
	if req.MinPrice == 0 || req.MaxPrice == 0 {
		api.sendError(w, "Min and max price must be greater than 0", http.StatusBadRequest)
		return
	}
	if req.MinPrice > req.MaxPrice {
		api.sendError(w, "Min price must be less than or equal to max price", http.StatusBadRequest)
		return
	}

	// Create order via app
	orderID := api.app.CreateOrder(req.Amount, req.Stablecoin, req.MinPrice, req.MaxPrice)

	// Send response
	api.sendJSON(w, CreateOrderResponse{OrderID: orderID})
}

func (api *APIServer) handleOrders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	orders := api.app.ListOrders()
	api.sendJSON(w, ListOrdersResponse{Orders: orders})
}

func (api *APIServer) handleNegotiateRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req NegotiateRequestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		api.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Request order details
	api.app.RequestOrderDetails(req.OrderID)

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"request sent"}`))
}

func (api *APIServer) handleNegotiatePropose(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req NegotiateProposeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		api.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Price == 0 || req.Amount == 0 {
		api.sendError(w, "Price and amount must be greater than 0", http.StatusBadRequest)
		return
	}

	// Propose price
	api.app.ProposePrice(req.OrderID, req.Price, req.Amount)

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"proposal sent"}`))
}

func (api *APIServer) handleListProposals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ListProposalsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		api.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get proposals for the order
	proposals := api.app.ListProposals(req.OrderID)

	api.sendJSON(w, ListProposalsResponse{Proposals: proposals})
}

func (api *APIServer) handleAcceptProposal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req AcceptProposalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		api.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Accept the proposal
	if err := api.app.AcceptProposal(req.ProposalID); err != nil {
		api.sendError(w, err.Error(), http.StatusNotFound)
		return
	}

	api.sendJSON(w, AcceptProposalResponse{Status: "accepted"})
}

func (api *APIServer) handlePeers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get peers from network manager
	peers := api.app.network.GetPeers()

	peerInfos := make([]PeerInfo, len(peers))
	for i, peer := range peers {
		peerInfos[i] = PeerInfo{
			ID:      string(peer.ID),
			Address: peer.Addr,
		}
	}

	api.sendJSON(w, PeersResponse{Peers: peerInfos})
}

func (api *APIServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get status from network and app
	status := api.app.network.GetStatus()
	orders := api.app.ListOrders()

	response := StatusResponse{
		PeerID:     status.PeerID,
		ListenAddr: status.ListenAddr,
		PeerCount:  status.PeerCount,
		OrderCount: len(orders),
	}

	api.sendJSON(w, response)
}

// Helper methods

func (api *APIServer) sendJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func (api *APIServer) sendError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(ErrorResponse{Error: message})
}
