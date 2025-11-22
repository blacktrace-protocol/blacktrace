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

	"github.com/blacktrace/settlement-service/zcash"
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
	ProposalID      string
	OrderID         string
	MakerID         string
	TakerID         string
	AmountZEC       uint64
	AmountUSDC      uint64
	Secret          []byte
	HashHex         string
	Status          string
	ZECLocked       bool
	USDCLocked      bool
	HTLCScript      []byte // The HTLC Bitcoin Script
	HTLCP2SHAddress string // The P2SH address for the HTLC
	HTLCLockTxID    string // Transaction ID that locked funds to HTLC
	HTLCLocktime    uint32 // Locktime for refund (24 hours from now in block height)
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// SettlementService coordinates HTLC settlements
type SettlementService struct {
	nc           *nats.Conn
	zcashClient  *zcash.Client
	settlements  map[string]*SettlementState
	mu           sync.RWMutex
	aliceAddress string // Alice's Zcash address for demo
	bobAddress   string // Bob's Zcash address for demo
}

// NewSettlementService creates a new settlement service
func NewSettlementService(natsURL, zcashRPCURL, zcashUser, zcashPassword string) (*SettlementService, error) {
	nc, err := nats.Connect(natsURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	// Initialize Zcash RPC client
	zcashClient := zcash.NewClient(zcashRPCURL, zcashUser, zcashPassword)

	service := &SettlementService{
		nc:          nc,
		zcashClient: zcashClient,
		settlements: make(map[string]*SettlementState),
	}

	// Bootstrap the Zcash regtest node
	if err := service.bootstrapZcash(); err != nil {
		log.Printf("Warning: Failed to bootstrap Zcash: %v", err)
		log.Printf("Continuing without Zcash integration...")
	}

	return service, nil
}

// createZcashHTLC creates a real HTLC on the Zcash blockchain
func (s *SettlementService) createZcashHTLC(state *SettlementState, amountZEC uint64) error {
	log.Printf("Creating Zcash HTLC for %d ZEC...", amountZEC)

	// Decode secret hash from hex
	secretHash, err := hex.DecodeString(state.HashHex)
	if err != nil {
		return fmt.Errorf("failed to decode secret hash: %w", err)
	}

	// Get current block height for locktime calculation
	blockHeight, err := s.zcashClient.GetBlockCount()
	if err != nil {
		return fmt.Errorf("failed to get block count: %w", err)
	}

	// Set locktime to current height + 144 blocks (approximately 24 hours)
	locktime := uint32(blockHeight + 144)
	state.HTLCLocktime = locktime

	// For demo purposes, we'll use simple addresses
	// In production, these would come from the users' public keys
	// For now, we'll create placeholder pubkey hashes
	// Note: In a real implementation, users would provide their public keys

	// Create dummy pubkey hashes for Alice (recipient) and Bob (refund)
	// In production, these would be derived from actual user public keys
	alicePubKeyHash := zcash.Hash160([]byte("alice_pubkey_placeholder"))
	bobPubKeyHash := zcash.Hash160([]byte("bob_pubkey_placeholder"))

	// Build HTLC script
	htlcScript := &zcash.HTLCScript{
		SecretHash:          secretHash,
		RecipientPubKeyHash: alicePubKeyHash,
		RefundPubKeyHash:    bobPubKeyHash,
		Locktime:            locktime,
	}

	script, err := zcash.BuildHTLCScript(htlcScript)
	if err != nil {
		return fmt.Errorf("failed to build HTLC script: %w", err)
	}

	state.HTLCScript = script

	// Generate P2SH address from script
	p2shAddress, err := zcash.ScriptToP2SHAddress(script, "regtest")
	if err != nil {
		return fmt.Errorf("failed to generate P2SH address: %w", err)
	}

	state.HTLCP2SHAddress = p2shAddress

	log.Printf("HTLC P2SH Address: %s", p2shAddress)
	log.Printf("Locktime: %d (block height)", locktime)

	// Create and broadcast transaction locking ZEC to HTLC
	amountFloat := float64(amountZEC) / 100000000.0 // Convert satoshis to ZEC
	txid, err := s.zcashClient.CreateAndBroadcastHTLCLock(s.aliceAddress, p2shAddress, amountFloat)
	if err != nil {
		return fmt.Errorf("failed to create HTLC lock transaction: %w", err)
	}

	state.HTLCLockTxID = txid

	log.Printf("✅ HTLC Lock Transaction broadcast: %s", txid)

	// Mine a block to confirm the transaction (regtest only)
	s.zcashClient.Generate(1)
	log.Printf("⛏️  Mined 1 block to confirm HTLC lock")

	return nil
}

// bootstrapZcash initializes the Zcash regtest node with blocks and test addresses
func (s *SettlementService) bootstrapZcash() error {
	log.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	log.Println("⚡ BOOTSTRAPPING ZCASH REGTEST NODE")
	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	// Check node info
	info, err := s.zcashClient.GetInfo()
	if err != nil {
		return fmt.Errorf("failed to get node info: %w", err)
	}
	log.Printf("✓ Connected to Zcash node")
	log.Printf("  Version: %.0f", info["version"])
	log.Printf("  Network: %s", info["testnet"])

	// Get current block count
	blockCount, err := s.zcashClient.GetBlockCount()
	if err != nil {
		return fmt.Errorf("failed to get block count: %w", err)
	}
	log.Printf("  Current block height: %d", blockCount)

	// Mine initial blocks if needed (need 101 blocks for coinbase maturity)
	if blockCount < 101 {
		log.Printf("\n⛏️  Mining %d blocks to mature coinbase rewards...", 101-blockCount)
		blocks, err := s.zcashClient.Generate(101 - int(blockCount))
		if err != nil {
			return fmt.Errorf("failed to generate blocks: %w", err)
		}
		log.Printf("✓ Mined %d blocks", len(blocks))

		// Get new block count
		blockCount, _ = s.zcashClient.GetBlockCount()
		log.Printf("  New block height: %d", blockCount)
	}

	// Get wallet balance
	balance, err := s.zcashClient.GetBalance()
	if err != nil {
		return fmt.Errorf("failed to get balance: %w", err)
	}
	log.Printf("\n💰 Wallet balance: %.8f ZEC", balance)

	// Create addresses for Alice and Bob
	aliceAddr, err := s.zcashClient.GetNewAddress()
	if err != nil {
		return fmt.Errorf("failed to create Alice's address: %w", err)
	}
	s.aliceAddress = aliceAddr
	log.Printf("\n👤 Alice's address: %s", aliceAddr)

	bobAddr, err := s.zcashClient.GetNewAddress()
	if err != nil {
		return fmt.Errorf("failed to create Bob's address: %w", err)
	}
	s.bobAddress = bobAddr
	log.Printf("👤 Bob's address:   %s", bobAddr)

	// Ensure we have enough balance to fund addresses
	// Mine more blocks if needed
	if balance < 20 {
		blocksNeeded := 10 // Mine 10 more blocks (100 ZEC)
		log.Printf("\n⛏️  Mining %d more blocks to ensure sufficient balance...", blocksNeeded)
		s.zcashClient.Generate(blocksNeeded)

		// Wait for blocks to mature (mine 100 more to be safe)
		log.Printf("⛏️  Mining 100 blocks to mature coinbase...")
		s.zcashClient.Generate(100)

		// Get updated balance
		balance, _ = s.zcashClient.GetBalance()
		log.Printf("✓ Updated wallet balance: %.8f ZEC", balance)
	}

	// Fund Alice and Bob with test ZEC
	log.Printf("\n💸 Funding test addresses...")

	// Send 5 ZEC to Alice
	txid, err := s.zcashClient.SendToAddress(aliceAddr, 5.0)
	if err != nil {
		log.Printf("Warning: Failed to fund Alice: %v", err)
	} else {
		log.Printf("✓ Funded Alice with 5 ZEC (txid: %s)", txid[:16]+"...")
	}

	// Send 5 ZEC to Bob
	txid, err = s.zcashClient.SendToAddress(bobAddr, 5.0)
	if err != nil {
		log.Printf("Warning: Failed to fund Bob: %v", err)
	} else {
		log.Printf("✓ Funded Bob with 5 ZEC (txid: %s)", txid[:16]+"...")
	}

	// Mine a block to confirm transactions
	log.Printf("\n⛏️  Mining 1 block to confirm funding transactions...")
	s.zcashClient.Generate(1)
	log.Printf("✓ Funding transactions confirmed")

	log.Println("\n✅ Zcash regtest node ready for HTLC settlements")
	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

	return nil
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
		// Create HTLC on Zcash blockchain
		err := s.createZcashHTLC(state, update.Amount)
		if err != nil {
			log.Printf("Error creating Zcash HTLC: %v", err)
			s.mu.Unlock()
			return
		}

		state.ZECLocked = true
		state.Status = "alice_locked"
		state.UpdatedAt = time.Now()

		fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println("📬 SETTLEMENT STATUS UPDATE - ZCASH HTLC CREATED")
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Printf("\n  Action:      %s\n", update.Action)
		fmt.Printf("  Status:      %s\n\n", state.Status)
		fmt.Printf("  🔒 Alice locked %d ZEC to HTLC\n", update.Amount)
		fmt.Printf("  📍 HTLC Address: %s\n", state.HTLCP2SHAddress)
		fmt.Printf("  📜 Lock TX:      %s\n\n", state.HTLCLockTxID)
		fmt.Println("  ✅ ZEC locked on Zcash blockchain")
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
	// Get configuration from environment
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://localhost:4222"
	}

	zcashRPCURL := os.Getenv("ZCASH_RPC_URL")
	if zcashRPCURL == "" {
		zcashRPCURL = "http://localhost:18232"
	}

	zcashUser := os.Getenv("ZCASH_RPC_USER")
	if zcashUser == "" {
		zcashUser = "blacktrace"
	}

	zcashPassword := os.Getenv("ZCASH_RPC_PASSWORD")
	if zcashPassword == "" {
		zcashPassword = "regtest123"
	}

	log.Printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	log.Printf("🦀 BLACKTRACE SETTLEMENT SERVICE")
	log.Printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	log.Printf("\n📡 Connecting to NATS at %s...", natsURL)
	log.Printf("⚡ Connecting to Zcash at %s...\n", zcashRPCURL)

	service, err := NewSettlementService(natsURL, zcashRPCURL, zcashUser, zcashPassword)
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
