package node

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
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
	// Authentication endpoints
	mux.HandleFunc("/auth/register", api.handleAuthRegister)
	mux.HandleFunc("/auth/login", api.handleAuthLogin)
	mux.HandleFunc("/auth/logout", api.handleAuthLogout)
	mux.HandleFunc("/auth/whoami", api.handleAuthWhoami)

	// Order and negotiation endpoints
	mux.HandleFunc("/orders", api.handleOrders)
	mux.HandleFunc("/orders/create", api.handleCreateOrder)
	mux.HandleFunc("/negotiate/request", api.handleNegotiateRequest)
	mux.HandleFunc("/negotiate/propose", api.handleNegotiatePropose)
	mux.HandleFunc("/negotiate/proposals", api.handleListProposals)
	mux.HandleFunc("/negotiate/accept", api.handleAcceptProposal)

	// Network endpoints
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
	SessionID  string         `json:"session_id"`
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
	SessionID string  `json:"session_id"`
	OrderID   OrderID `json:"order_id"`
	Price     uint64  `json:"price"`
	Amount    uint64  `json:"amount"`
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

// Authentication request/response types

type AuthRegisterRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AuthRegisterResponse struct {
	Username string `json:"username"`
	Status   string `json:"status"`
}

type AuthLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AuthLoginResponse struct {
	SessionID string `json:"session_id"`
	Username  string `json:"username"`
	ExpiresAt string `json:"expires_at"`
}

type AuthLogoutRequest struct {
	SessionID string `json:"session_id"`
}

type AuthLogoutResponse struct {
	Status string `json:"status"`
}

type AuthWhoamiRequest struct {
	SessionID string `json:"session_id"`
}

type AuthWhoamiResponse struct {
	Username   string `json:"username"`
	SessionID  string `json:"session_id"`
	LoggedInAt string `json:"logged_in_at"`
	ExpiresAt  string `json:"expires_at"`
}

// Handlers

func (api *APIServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

// Authentication handlers

func (api *APIServer) handleAuthRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req AuthRegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		api.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Username == "" {
		api.sendError(w, "Username is required", http.StatusBadRequest)
		return
	}
	if req.Password == "" {
		api.sendError(w, "Password is required", http.StatusBadRequest)
		return
	}

	// Register user
	authMgr := api.app.GetAuthManager()
	if err := authMgr.Register(req.Username, req.Password); err != nil {
		api.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	api.sendJSON(w, AuthRegisterResponse{
		Username: req.Username,
		Status:   "registered",
	})
}

func (api *APIServer) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req AuthLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		api.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Username == "" {
		api.sendError(w, "Username is required", http.StatusBadRequest)
		return
	}
	if req.Password == "" {
		api.sendError(w, "Password is required", http.StatusBadRequest)
		return
	}

	// Login user
	authMgr := api.app.GetAuthManager()
	sessionID, err := authMgr.Login(req.Username, req.Password)
	if err != nil {
		api.sendError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	// Get session details
	session, err := authMgr.GetSession(sessionID)
	if err != nil {
		api.sendError(w, "Failed to get session details", http.StatusInternalServerError)
		return
	}

	api.sendJSON(w, AuthLoginResponse{
		SessionID: sessionID,
		Username:  req.Username,
		ExpiresAt: session.ExpiresAt.Format(time.RFC3339),
	})
}

func (api *APIServer) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req AuthLogoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		api.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Logout user
	authMgr := api.app.GetAuthManager()
	if err := authMgr.Logout(req.SessionID); err != nil {
		api.sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	api.sendJSON(w, AuthLogoutResponse{
		Status: "logged out",
	})
}

func (api *APIServer) handleAuthWhoami(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req AuthWhoamiRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		api.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get session
	authMgr := api.app.GetAuthManager()
	session, err := authMgr.GetSession(req.SessionID)
	if err != nil {
		api.sendError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	api.sendJSON(w, AuthWhoamiResponse{
		Username:   session.Username,
		SessionID:  session.SessionID,
		LoggedInAt: session.LoggedInAt.Format(time.RFC3339),
		ExpiresAt:  session.ExpiresAt.Format(time.RFC3339),
	})
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

	// Authenticate user
	authMgr := api.app.GetAuthManager()
	identity, _, err := authMgr.RequireAuth(req.SessionID)
	if err != nil {
		api.sendError(w, "Authentication required: "+err.Error(), http.StatusUnauthorized)
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

	// Create order via app (will be updated to accept identity)
	orderID := api.app.CreateOrder(req.Amount, req.Stablecoin, req.MinPrice, req.MaxPrice)

	log.Printf("Order %s created by user: %s", orderID, identity.Username)

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

	// Authenticate user
	authMgr := api.app.GetAuthManager()
	identity, _, err := authMgr.RequireAuth(req.SessionID)
	if err != nil {
		api.sendError(w, "Authentication required: "+err.Error(), http.StatusUnauthorized)
		return
	}

	if req.Price == 0 || req.Amount == 0 {
		api.sendError(w, "Price and amount must be greater than 0", http.StatusBadRequest)
		return
	}

	// Propose price (will be updated to accept identity)
	api.app.ProposePrice(req.OrderID, req.Price, req.Amount)

	log.Printf("Proposal for order %s created by user: %s", req.OrderID, identity.Username)

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
