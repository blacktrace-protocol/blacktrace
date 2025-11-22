package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/nats-io/nats.go"
	"golang.org/x/crypto/ripemd160"
)

// SettlementRequest represents the initial settlement request message
type SettlementRequest struct {
	ProposalID      string    `json:"proposal_id"`
	OrderID         string    `json:"order_id"`
	MakerID         string    `json:"maker_id"`
	TakerID         string    `json:"taker_id"`
	Amount          uint64    `json:"amount"`
	Price           uint64    `json:"price"`
	Stablecoin      string    `json:"stablecoin"`
	SettlementChain string    `json:"settlement_chain"`
	Timestamp       time.Time `json:"timestamp"`
}

// SettlementStatusUpdate represents status updates from the nodes
type SettlementStatusUpdate struct {
	ProposalID       string    `json:"proposal_id"`
	OrderID          string    `json:"order_id"`
	SettlementStatus string    `json:"settlement_status"`
	Action           string    `json:"action"`
	Amount           uint64    `json:"amount"`
	AmountUSDC       uint64    `json:"amount_usdc"`
	Timestamp        time.Time `json:"timestamp"`
}

// SettlementState tracks the state of a settlement
type SettlementState struct {
	ProposalID string
	OrderID    string
	MakerID    string
	TakerID    string
	AmountZEC  uint64
	AmountUSDC uint64
	Secret     []byte
	HashHex    string
	Status     string
	ZECLocked  bool
	USDCLocked bool
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// SettlementService coordinates HTLC settlements
type SettlementService struct {
	nc         *nats.Conn
	settlements map[string]*SettlementState
	mu         sync.RWMutex
}

// NewSettlementService creates a new settlement service
func NewSettlementService(natsURL string) (*SettlementService, error) {
	nc, err := nats.Connect(natsURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	return &SettlementService{
		nc:          nc,
		settlements: make(map[string]*SettlementState),
	}, nil
}

// generateSecretAndHash generates a 32-byte random secret and its RIPEMD160(SHA256(secret)) hash
func generateSecretAndHash() ([]byte, string, error) {
	// Generate 32-byte random secret
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, "", fmt.Errorf("failed to generate secret: %w", err)
	}

	// Generate hash (SHA256 -> RIPEMD160 for Zcash compatibility)
	shaHash := sha256.Sum256(secret)
	ripemdHasher := ripemd160.New()
	ripemdHasher.Write(shaHash[:])
	ripemdHash := ripemdHasher.Sum(nil)
	hashHex := hex.EncodeToString(ripemdHash)

	return secret, hashHex, nil
}

// handleSettlementRequest handles new settlement requests
func (s *SettlementService) handleSettlementRequest(msg *nats.Msg) {
	var req SettlementRequest
	if err := json.Unmarshal(msg.Data, &req); err != nil {
		log.Printf("Error parsing settlement request: %v", err)
		return
	}

	// Generate HTLC secret and hash
	secret, hashHex, err := generateSecretAndHash()
	if err != nil {
		log.Printf("Error generating secret: %v", err)
		return
	}

	// Create settlement state
	state := &SettlementState{
		ProposalID: req.ProposalID,
		OrderID:    req.OrderID,
		MakerID:    req.MakerID,
		TakerID:    req.TakerID,
		AmountZEC:  req.Amount,
		AmountUSDC: req.Amount * req.Price,
		Secret:     secret,
		HashHex:    hashHex,
		Status:     "ready",
		ZECLocked:  false,
		USDCLocked: false,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	s.mu.Lock()
	s.settlements[req.ProposalID] = state
	s.mu.Unlock()

	// Log the settlement initialization
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("📩 NEW SETTLEMENT REQUEST")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Printf("\n  Proposal ID: %s\n", req.ProposalID)
	fmt.Printf("  Order ID:    %s\n\n", req.OrderID)
	fmt.Printf("  👥 Parties:\n")
	fmt.Printf("     Maker:    %s\n", req.MakerID)
	fmt.Printf("     Taker:    %s\n\n", req.TakerID)
	fmt.Printf("  💰 Trade:\n")
	fmt.Printf("     Amount:   %d ZEC\n", req.Amount)
	fmt.Printf("     Price:    $%d\n", req.Price)
	fmt.Printf("     Total:    $%d\n\n", state.AmountUSDC)
	fmt.Printf("  🔐 HTLC Generated:\n")
	fmt.Printf("     Secret:   32 bytes (kept private)\n")
	fmt.Printf("     Hash:     %s\n\n", hashHex)
	fmt.Println("  ✅ Settlement initialized")
	fmt.Println("  📌 Status: ready → waiting for Alice to lock ZEC")
	fmt.Println()

	// Publish HTLC parameters to NATS
	htlcParams := map[string]interface{}{
		"proposal_id": req.ProposalID,
		"order_id":    req.OrderID,
		"hash":        hashHex,
		"timeout":     24 * 3600, // 24 hours in seconds
		"status":      "ready",
	}

	paramsJSON, _ := json.Marshal(htlcParams)
	topic := fmt.Sprintf("settlement.htlc.%s", req.ProposalID)
	if err := s.nc.Publish(topic, paramsJSON); err != nil {
		log.Printf("Error publishing HTLC params: %v", err)
	}
}

// handleStatusUpdate handles settlement status updates
func (s *SettlementService) handleStatusUpdate(msg *nats.Msg) {
	var update SettlementStatusUpdate
	if err := json.Unmarshal(msg.Data, &update); err != nil {
		log.Printf("Error parsing status update: %v", err)
		return
	}

	s.mu.Lock()
	state, exists := s.settlements[update.ProposalID]
	if !exists {
		s.mu.Unlock()
		log.Printf("Unknown proposal ID: %s", update.ProposalID)
		return
	}

	// Update state based on action
	switch update.Action {
	case "alice_lock_zec":
		state.ZECLocked = true
		state.Status = "alice_locked"
		state.UpdatedAt = time.Now()

		fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println("📬 SETTLEMENT STATUS UPDATE")
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Printf("\n  Action:      %s\n", update.Action)
		fmt.Printf("  Status:      %s\n\n", state.Status)
		fmt.Printf("  🔒 Alice is locking %d ZEC\n\n", update.Amount)
		fmt.Println("  ✅ ZEC lock confirmed")
		fmt.Println("  📌 Status: alice_locked → waiting for Bob to lock USDC")
		fmt.Println()

	case "bob_lock_usdc":
		state.USDCLocked = true
		state.Status = "both_locked"
		state.UpdatedAt = time.Now()

		fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println("📬 SETTLEMENT STATUS UPDATE")
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Printf("\n  Action:      %s\n", update.Action)
		fmt.Printf("  Status:      %s\n\n", state.Status)
		fmt.Printf("  🔒 Bob is locking $%d USDC\n\n", update.AmountUSDC)
		fmt.Println("  ✅ USDC lock confirmed")
		fmt.Println("  🎉 BOTH ASSETS LOCKED!")
		fmt.Printf("\n  📌 Status: both_locked → ready for claiming\n\n")
		fmt.Println("  🔓 REVEALING SECRET FOR ATOMIC SWAP")
		fmt.Printf("\n  Secret (hex): %s\n", hex.EncodeToString(state.Secret))
		fmt.Printf("  Hash (hex):   %s\n\n", state.HashHex)
		fmt.Println("  💡 Claims:")
		fmt.Println("     1. Alice claims USDC on Starknet (reveals secret on-chain)")
		fmt.Println("     2. Bob sees secret on Starknet, claims ZEC on Zcash")
		fmt.Println("\n  ✨ ATOMIC SWAP READY FOR COMPLETION")
		fmt.Println()

		// Publish secret reveal to NATS
		secretReveal := map[string]interface{}{
			"proposal_id": update.ProposalID,
			"secret":      hex.EncodeToString(state.Secret),
			"hash":        state.HashHex,
			"status":      "both_locked",
		}

		secretJSON, _ := json.Marshal(secretReveal)
		topic := fmt.Sprintf("settlement.secret.%s", update.ProposalID)
		if err := s.nc.Publish(topic, secretJSON); err != nil {
			log.Printf("Error publishing secret reveal: %v", err)
		}
	}

	s.mu.Unlock()
}

// Start begins listening for NATS messages
func (s *SettlementService) Start() error {
	// Subscribe to settlement requests
	_, err := s.nc.Subscribe("settlement.request.*", func(msg *nats.Msg) {
		s.handleSettlementRequest(msg)
	})
	if err != nil {
		return fmt.Errorf("failed to subscribe to settlement.request.*: %w", err)
	}

	// Subscribe to status updates
	_, err = s.nc.Subscribe("settlement.status.*", func(msg *nats.Msg) {
		s.handleStatusUpdate(msg)
	})
	if err != nil {
		return fmt.Errorf("failed to subscribe to settlement.status.*: %w", err)
	}

	log.Println("✓ Subscribed to settlement requests")
	log.Println("✓ Subscribed to settlement status updates")
	log.Println("\n🦀 Settlement Service Ready - Waiting for settlement requests...")

	return nil
}

// Close gracefully shuts down the service
func (s *SettlementService) Close() {
	if s.nc != nil {
		s.nc.Close()
	}
}

func main() {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://localhost:4222"
	}

	log.Printf("Connecting to NATS at %s...", natsURL)

	service, err := NewSettlementService(natsURL)
	if err != nil {
		log.Fatalf("Failed to create settlement service: %v", err)
	}
	defer service.Close()

	if err := service.Start(); err != nil {
		log.Fatalf("Failed to start settlement service: %v", err)
	}

	// Keep the service running
	select {}
}
