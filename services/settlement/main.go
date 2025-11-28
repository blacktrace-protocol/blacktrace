package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/blacktrace/blacktrace/connectors/zcash"
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
	Secret          string    `json:"secret"` // Alice's secret for HTLC
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
	ZcashAddress     string    `json:"zcash_address,omitempty"`     // User's personal Zcash address
	Username         string    `json:"username,omitempty"`          // Username for wallet lookup
	Secret           string    `json:"secret,omitempty"`            // Alice's secret for HTLC (provided by user)
	AlicePubKeyHash  string    `json:"alice_pubkey_hash,omitempty"` // Alice's pubkey hash (hex) for HTLC claim
	BobPubKeyHash    string    `json:"bob_pubkey_hash,omitempty"`   // Bob's pubkey hash (hex) for HTLC refund
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
	AlicePubKeyHash []byte // Alice's pubkey hash for HTLC claim (Bob provides secret + sig to claim)
	BobPubKeyHash   []byte // Bob's pubkey hash for HTLC refund (after timeout)
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// SettlementService coordinates HTLC settlements
type SettlementService struct {
	nc          *nats.Conn
	zcashClient *zcash.Client
	settlements map[string]*SettlementState
	mu          sync.RWMutex
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
// amountCents is in cents (100 = 1 ZEC)
func (s *SettlementService) createZcashHTLC(state *SettlementState, amountCents uint64, userZcashAddress string) error {
	amountZEC := float64(amountCents) / 100.0
	log.Printf("Creating Zcash HTLC for %.2f ZEC from user address %s...", amountZEC, userZcashAddress)

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

	// Use real pubkey hashes from the settlement state
	// These are set from the status update containing Alice's and Bob's pubkey hashes
	// In this HTLC:
	// - Bob is the RECIPIENT (claims with secret + signature)
	// - Alice is the REFUND address (can reclaim after timeout)
	bobPubKeyHash := state.BobPubKeyHash     // Bob claims the ZEC with secret
	alicePubKeyHash := state.AlicePubKeyHash // Alice refunds if timeout

	// Validate pubkey hashes are provided
	if len(alicePubKeyHash) != 20 || len(bobPubKeyHash) != 20 {
		return fmt.Errorf("invalid pubkey hashes: alice=%d bytes, bob=%d bytes (expected 20 each)", len(alicePubKeyHash), len(bobPubKeyHash))
	}

	log.Printf("Using real pubkey hashes:")
	log.Printf("  Bob (recipient/claimer): %s", hex.EncodeToString(bobPubKeyHash))
	log.Printf("  Alice (refund/timeout):  %s", hex.EncodeToString(alicePubKeyHash))

	// Build HTLC script
	// RecipientPubKeyHash: Bob claims ZEC by providing secret + his signature
	// RefundPubKeyHash: Alice refunds after timeout using her signature
	htlcScript := &zcash.HTLCScript{
		SecretHash:          secretHash,
		RecipientPubKeyHash: bobPubKeyHash,   // Bob claims with secret
		RefundPubKeyHash:    alicePubKeyHash, // Alice refunds after timeout
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

	// Create and broadcast transaction locking ZEC to HTLC from user's personal wallet
	txid, err := s.zcashClient.CreateAndBroadcastHTLCLock(userZcashAddress, p2shAddress, amountZEC)
	if err != nil {
		return fmt.Errorf("failed to create HTLC lock transaction from %s: %w", userZcashAddress, err)
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

	// Ensure we have enough balance to fund user addresses on-demand (need 5000+ ZEC)
	// Mine more blocks if needed
	if balance < 5000 {
		// Each block gives 10 ZEC, need 500+ blocks
		blocksNeeded := 550 // Mine 550 blocks (5500 ZEC)
		log.Printf("\n⛏️  Mining %d blocks slowly to build up balance (prevents median-time issues)...", blocksNeeded)
		if err := s.mineBlocksSlowly(blocksNeeded, 3*time.Second); err != nil {
			log.Printf("Warning: Failed to mine balance blocks: %v", err)
		}

		// Wait for blocks to mature (need 100 confirmations)
		log.Printf("⛏️  Mining 100 more blocks slowly to mature coinbase...")
		if err := s.mineBlocksSlowly(100, 3*time.Second); err != nil {
			log.Printf("Warning: Failed to mine maturity blocks: %v", err)
		}

		// Get updated balance
		balance, _ = s.zcashClient.GetBalance()
		log.Printf("✓ Updated wallet balance: %.8f ZEC", balance)
	}

	log.Printf("\n✅ Zcash regtest node ready for on-demand wallet creation and funding")
	log.Printf("   Platform balance: %.2f ZEC available for funding user wallets", balance)
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

	// Use Alice's provided secret instead of generating a random one
	var secret []byte
	var hashHex string

	if req.Secret != "" {
		// Use Alice's secret
		secret = []byte(req.Secret)
		// Generate hash (SHA256 -> RIPEMD160 for Zcash compatibility)
		shaHash := sha256.Sum256(secret)
		ripemdHasher := ripemd160.New()
		ripemdHasher.Write(shaHash[:])
		ripemdHash := ripemdHasher.Sum(nil)
		hashHex = hex.EncodeToString(ripemdHash)
		log.Printf("Using Alice's provided secret (hash: %s)", hashHex)
	} else {
		// Fallback to generating random secret (shouldn't happen)
		var err error
		secret, hashHex, err = generateSecretAndHash()
		if err != nil {
			log.Printf("Error generating secret: %v", err)
			return
		}
		log.Printf("WARNING: No secret provided, using generated secret")
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
	fmt.Printf("     Amount:   %.2f ZEC\n", float64(req.Amount)/100.0)
	fmt.Printf("     Price:    $%d\n", req.Price)
	fmt.Printf("     Total:    $%.2f\n\n", float64(state.AmountUSDC)/100.0)
	fmt.Printf("  🔐 HTLC Secret:\n")
	fmt.Printf("     Source:   Alice's provided secret\n")
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
		// Amount is in cents, keep as-is and convert to float ZEC in createZcashHTLC
		amountZEC := update.Amount // Amount in cents (100 = 1 ZEC)

		// Use user's personal Zcash address (required)
		zcashAddress := update.ZcashAddress
		if zcashAddress == "" {
			log.Printf("Error: No user Zcash address provided for HTLC lock")
			s.mu.Unlock()
			return
		}

		// Extract pubkey hashes from the update (required for HTLC security)
		if update.AlicePubKeyHash == "" || update.BobPubKeyHash == "" {
			log.Printf("Error: Alice and Bob pubkey hashes are required for HTLC")
			s.mu.Unlock()
			return
		}

		// Decode pubkey hashes from hex
		alicePubKeyHash, err := hex.DecodeString(update.AlicePubKeyHash)
		if err != nil {
			log.Printf("Error decoding Alice pubkey hash: %v", err)
			s.mu.Unlock()
			return
		}
		bobPubKeyHash, err := hex.DecodeString(update.BobPubKeyHash)
		if err != nil {
			log.Printf("Error decoding Bob pubkey hash: %v", err)
			s.mu.Unlock()
			return
		}

		// Store pubkey hashes in state for HTLC creation
		state.AlicePubKeyHash = alicePubKeyHash
		state.BobPubKeyHash = bobPubKeyHash

		log.Printf("Received pubkey hashes - Alice: %s, Bob: %s", update.AlicePubKeyHash, update.BobPubKeyHash)

		err = s.createZcashHTLC(state, amountZEC, zcashAddress)
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
		fmt.Printf("  🔒 Alice locked %.2f ZEC to HTLC\n", float64(update.Amount)/100.0)
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

	// Start background block miner for regtest (mines 1 block every 60 seconds)
	go s.backgroundBlockMiner()

	log.Println("\n🦀 Settlement Service Ready - Waiting for settlement requests...")

	return nil
}

// mineBlocksSlowly mines blocks fast using mocktime with proper timestamp spacing
// This prevents median-time-past issues while keeping bootstrap fast
func (s *SettlementService) mineBlocksSlowly(numBlocks int, delayBetweenBlocks time.Duration) error {
	// Get current Unix timestamp
	startTime := time.Now().Unix()

	// Mine blocks with mocktime to control timestamps
	for i := 0; i < numBlocks; i++ {
		// Set mocktime to (startTime + i * delayBetweenBlocks)
		mockTime := startTime + int64(i)*int64(delayBetweenBlocks.Seconds())
		if err := s.zcashClient.SetMockTime(mockTime); err != nil {
			log.Printf("Warning: Failed to set mocktime: %v", err)
		}

		_, err := s.zcashClient.Generate(1)
		if err != nil {
			return fmt.Errorf("failed to mine block %d/%d: %w", i+1, numBlocks, err)
		}

		// Log progress every 50 blocks to avoid spam
		if (i+1)%50 == 0 || i == numBlocks-1 {
			log.Printf("  ⛏️  Mined %d/%d blocks", i+1, numBlocks)
		}
	}

	// Reset mocktime to resume normal time
	if err := s.zcashClient.SetMockTime(0); err != nil {
		log.Printf("Warning: Failed to reset mocktime: %v", err)
	}

	return nil
}

// backgroundBlockMiner mines blocks periodically to confirm pending transactions
func (s *SettlementService) backgroundBlockMiner() {
	log.Println("⛏️  Background block miner started (mining every 60 seconds)")

	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if s.zcashClient != nil {
			_, err := s.zcashClient.Generate(1)
			if err != nil {
				log.Printf("⚠️  Background mining failed: %v", err)
				continue
			}
			log.Println("⛏️  Background miner: mined 1 block")
		}
	}
}

// Close gracefully shuts down the service
func (s *SettlementService) Close() {
	if s.nc != nil {
		s.nc.Close()
	}
}

// HTTP API handlers for wallet operations

// handleCreateAddress creates a new Zcash address and returns keypair info
func (s *SettlementService) handleCreateAddress(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Create new Zcash address
	address, err := s.zcashClient.GetNewAddress()
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create address: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("✓ Created new Zcash address: %s", address)

	// Get the private key for this address (WIF format)
	privKey, err := s.zcashClient.DumpPrivKey(address)
	if err != nil {
		log.Printf("Warning: Failed to get private key for %s: %v", address, err)
		// Continue without private key - not critical for basic functionality
	}

	// Get address info including pubkey
	addrInfo, err := s.zcashClient.ValidateAddress(address)
	if err != nil {
		log.Printf("Warning: Failed to validate address %s: %v", address, err)
	}

	// Extract pubkey from address info
	var pubKey string
	var pubKeyHash string
	if addrInfo != nil {
		if pk, ok := addrInfo["pubkey"].(string); ok {
			pubKey = pk
			// Compute pubkey hash (HASH160 = RIPEMD160(SHA256(pubkey)))
			pubKeyBytes, _ := hex.DecodeString(pk)
			if len(pubKeyBytes) > 0 {
				pubKeyHash = hex.EncodeToString(zcash.Hash160(pubKeyBytes))
			}
		}
	}

	log.Printf("  Private key: %s...", privKey[:10])
	log.Printf("  Public key: %s", pubKey)
	log.Printf("  PubKey hash: %s", pubKeyHash)

	response := map[string]interface{}{
		"address":      address,
		"private_key":  privKey,     // WIF format private key
		"pubkey":       pubKey,      // Compressed public key (hex)
		"pubkey_hash":  pubKeyHash,  // HASH160 of pubkey (hex)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleFundAddress sends ZEC to a specified address
func (s *SettlementService) handleFundAddress(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Address string  `json:"address"`
		Amount  float64 `json:"amount"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Address == "" {
		http.Error(w, "Address is required", http.StatusBadRequest)
		return
	}

	if req.Amount <= 0 {
		http.Error(w, "Amount must be greater than 0", http.StatusBadRequest)
		return
	}

	// Send ZEC to address
	txid, err := s.zcashClient.SendToAddress(req.Address, req.Amount)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to send ZEC: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("✓ Sent %.8f ZEC to %s (txid: %s)", req.Amount, req.Address, txid[:16]+"...")
	log.Printf("⏳ Transaction will be confirmed by background miner within 60 seconds")

	// Get updated balance (will show unconfirmed balance initially)
	balance, _ := s.zcashClient.GetAddressBalance(req.Address)

	// Return 0 blocks since we're not mining immediately
	var blocks []string

	response := map[string]interface{}{
		"success": true,
		"txid":    txid,
		"address": req.Address,
		"amount":  req.Amount,
		"balance": balance,
		"blocks":  len(blocks),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleAddressBalance returns the balance for any address
func (s *SettlementService) handleAddressBalance(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Get address from query parameter
	address := r.URL.Query().Get("address")
	if address == "" {
		http.Error(w, "Address parameter is required", http.StatusBadRequest)
		return
	}

	balance, err := s.zcashClient.GetAddressBalance(address)
	if err != nil {
		// Return JSON error response instead of plain text
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   fmt.Sprintf("Failed to get balance: %v", err),
			"address": address,
			"balance": 0.0, // Return 0 balance on error so frontend can still render
		})
		return
	}

	response := map[string]interface{}{
		"address": address,
		"balance": balance,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleGetHTLCParams returns the HTLC parameters needed for Bob to claim locally
func (s *SettlementService) handleGetHTLCParams(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	proposalID := r.URL.Query().Get("proposal_id")
	if proposalID == "" {
		http.Error(w, "proposal_id is required", http.StatusBadRequest)
		return
	}

	// Look up the settlement state
	s.mu.RLock()
	state, exists := s.settlements[proposalID]
	s.mu.RUnlock()

	if !exists {
		http.Error(w, "Settlement not found", http.StatusNotFound)
		return
	}

	if state.HTLCLockTxID == "" {
		http.Error(w, "HTLC not yet locked", http.StatusBadRequest)
		return
	}

	if len(state.HTLCScript) == 0 {
		http.Error(w, "HTLC script not available", http.StatusBadRequest)
		return
	}

	response := map[string]interface{}{
		"htlc_txid":     state.HTLCLockTxID,
		"htlc_vout":     0, // HTLC output is at index 0
		"htlc_amount":   float64(state.AmountZEC),
		"redeem_script": hex.EncodeToString(state.HTLCScript),
		"hash_lock":     state.HashHex,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleBroadcastTx broadcasts a signed transaction to the Zcash network
func (s *SettlementService) handleBroadcastTx(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		SignedTxHex string `json:"signed_tx_hex"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.SignedTxHex == "" {
		http.Error(w, "signed_tx_hex is required", http.StatusBadRequest)
		return
	}

	// Broadcast the transaction
	txid, err := s.zcashClient.BroadcastTransaction(req.SignedTxHex)
	if err != nil {
		log.Printf("Failed to broadcast transaction: %v", err)
		http.Error(w, fmt.Sprintf("Failed to broadcast transaction: %v", err), http.StatusInternalServerError)
		return
	}

	// Mine a block to confirm (regtest only)
	s.zcashClient.Generate(1)
	log.Printf("⛏️ Mined 1 block to confirm claim transaction")

	response := map[string]interface{}{
		"success": true,
		"txid":    txid,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleClaimZEC handles Bob's request to claim ZEC from the HTLC
// This now expects a pre-signed transaction from Bob's node
func (s *SettlementService) handleClaimZEC(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProposalID       string `json:"proposal_id"`
		Secret           string `json:"secret"`
		RecipientAddress string `json:"recipient_address"`
		PrivateKeyWIF    string `json:"private_key_wif"` // Bob's private key for signing (not stored)
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.ProposalID == "" {
		http.Error(w, "Proposal ID is required", http.StatusBadRequest)
		return
	}

	if req.Secret == "" {
		http.Error(w, "Secret is required", http.StatusBadRequest)
		return
	}

	if req.RecipientAddress == "" {
		http.Error(w, "Recipient address is required", http.StatusBadRequest)
		return
	}

	if req.PrivateKeyWIF == "" {
		http.Error(w, "private_key_wif is required for signing the claim transaction", http.StatusBadRequest)
		return
	}

	// Look up the settlement state
	s.mu.RLock()
	state, exists := s.settlements[req.ProposalID]
	s.mu.RUnlock()

	if !exists {
		http.Error(w, "Settlement not found", http.StatusNotFound)
		return
	}

	// Verify we have the HTLC info needed for claiming
	if state.HTLCLockTxID == "" {
		http.Error(w, "HTLC not yet locked", http.StatusBadRequest)
		return
	}

	// Decode the secret from the request
	var secretBytes []byte
	if decoded, err := hex.DecodeString(req.Secret); err == nil && len(decoded) == 32 {
		secretBytes = decoded
	} else {
		secretBytes = []byte(req.Secret)
	}

	// Verify the secret matches the stored hash
	shaHash := sha256.Sum256(secretBytes)
	ripemdHasher := ripemd160.New()
	ripemdHasher.Write(shaHash[:])
	computedHash := ripemdHasher.Sum(nil)
	computedHashHex := hex.EncodeToString(computedHash)

	if computedHashHex != state.HashHex {
		log.Printf("Secret verification failed: computed=%s, expected=%s", computedHashHex, state.HashHex)
		http.Error(w, "Invalid secret - hash does not match", http.StatusBadRequest)
		return
	}

	log.Printf("✅ Secret verified for proposal %s", req.ProposalID)

	// Import Bob's private key temporarily for signing (not stored persistently)
	log.Printf("🔑 Importing Bob's private key for signing...")
	if err := s.zcashClient.ImportPrivKey(req.PrivateKeyWIF); err != nil {
		log.Printf("Failed to import private key: %v", err)
		http.Error(w, fmt.Sprintf("Failed to import private key: %v", err), http.StatusInternalServerError)
		return
	}

	// Build claim parameters
	// AmountZEC is stored in cents (100 = 1 ZEC), convert to ZEC
	claimParams := &zcash.HTLCClaimParams{
		HTLCTxID:      state.HTLCLockTxID,
		HTLCVout:      0, // HTLC is always at vout 0
		HTLCAmount:    float64(state.AmountZEC) / 100.0,
		RedeemScript:  state.HTLCScript,
		Secret:        secretBytes,
		RecipientAddr: req.RecipientAddress,
	}

	// Create, sign, and broadcast the claim transaction using Zcash RPC
	txid, err := s.zcashClient.ClaimHTLC(claimParams)
	if err != nil {
		log.Printf("Failed to claim HTLC: %v", err)
		http.Error(w, fmt.Sprintf("Failed to claim HTLC: %v", err), http.StatusInternalServerError)
		return
	}

	// Mine a block to confirm the claim transaction (regtest only)
	s.zcashClient.Generate(1)
	log.Printf("⛏️ Mined 1 block to confirm HTLC claim")

	// Update settlement state
	s.mu.Lock()
	state.Status = "completed"
	state.UpdatedAt = time.Now()
	s.mu.Unlock()

	log.Printf("✅ ZEC claimed successfully! TX: %s", txid)

	response := map[string]interface{}{
		"success":          true,
		"txid":             txid,
		"amount":           float64(state.AmountZEC) / 100.0, // Convert from cents to ZEC
		"recipient":        req.RecipientAddress,
		"status":           "completed",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleAddressKeypair returns keypair info for an existing address (for wallet migration)
func (s *SettlementService) handleAddressKeypair(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Get address from query parameter
	address := r.URL.Query().Get("address")
	if address == "" {
		http.Error(w, "Address parameter is required", http.StatusBadRequest)
		return
	}

	// Get the private key for this address (WIF format)
	privKey, err := s.zcashClient.DumpPrivKey(address)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get private key for address: %v", err), http.StatusInternalServerError)
		return
	}

	// Get address info including pubkey
	addrInfo, err := s.zcashClient.ValidateAddress(address)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to validate address: %v", err), http.StatusInternalServerError)
		return
	}

	// Extract pubkey from address info
	var pubKey string
	var pubKeyHash string
	if addrInfo != nil {
		if pk, ok := addrInfo["pubkey"].(string); ok {
			pubKey = pk
			// Compute pubkey hash (HASH160 = RIPEMD160(SHA256(pubkey)))
			pubKeyBytes, _ := hex.DecodeString(pk)
			if len(pubKeyBytes) > 0 {
				pubKeyHash = hex.EncodeToString(zcash.Hash160(pubKeyBytes))
			}
		}
	}

	if pubKey == "" || pubKeyHash == "" {
		http.Error(w, "Could not extract pubkey info from address", http.StatusInternalServerError)
		return
	}

	log.Printf("✓ Retrieved keypair for address %s (migration)", address)
	log.Printf("  PubKey hash: %s", pubKeyHash)

	response := map[string]interface{}{
		"address":     address,
		"private_key": privKey,
		"pubkey":      pubKey,
		"pubkey_hash": pubKeyHash,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// StartHTTPServer starts the HTTP API server
func (s *SettlementService) StartHTTPServer(port string) {
	http.HandleFunc("/api/create-address", s.handleCreateAddress)
	http.HandleFunc("/api/fund-address", s.handleFundAddress)
	http.HandleFunc("/api/address-balance", s.handleAddressBalance)
	http.HandleFunc("/api/claim-zec", s.handleClaimZEC)
	http.HandleFunc("/api/htlc-params", s.handleGetHTLCParams)
	http.HandleFunc("/api/broadcast-tx", s.handleBroadcastTx)
	http.HandleFunc("/api/address-keypair", s.handleAddressKeypair)

	log.Printf("✓ Starting HTTP API server on :%s", port)
	go func() {
		if err := http.ListenAndServe(":"+port, nil); err != nil {
			log.Printf("HTTP server error: %v", err)
		}
	}()
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

	// Start HTTP API server for wallet balance queries
	service.StartHTTPServer("8090")

	// Keep the service running
	select {}
}
