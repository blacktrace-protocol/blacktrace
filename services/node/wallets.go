package node

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// WalletInfo stores wallet information for a user
type WalletInfo struct {
	Username      string  `json:"username"`
	ZcashAddress  string  `json:"zcash_address"`
	TotalFunded   float64 `json:"total_funded"` // Track total ZEC received
	FundingCount  int     `json:"funding_count"` // Number of times funded
}

// WalletManager manages user wallets
type WalletManager struct {
	wallets  map[string]*WalletInfo
	mu       sync.RWMutex
	dataDir  string
}

// NewWalletManager creates a new wallet manager
func NewWalletManager(dataDir string) (*WalletManager, error) {
	wm := &WalletManager{
		wallets: make(map[string]*WalletInfo),
		dataDir: dataDir,
	}

	// Load existing wallets
	if err := wm.load(); err != nil {
		return nil, fmt.Errorf("failed to load wallets: %w", err)
	}

	return wm, nil
}

// CreateWallet creates a new wallet for a user by requesting an address from settlement service
func (wm *WalletManager) CreateWallet(username, zcashAddress string) error {
	wm.mu.Lock()
	defer wm.mu.Unlock()

	// Check if wallet already exists
	if _, exists := wm.wallets[username]; exists {
		return fmt.Errorf("wallet already exists for user %s", username)
	}

	// Create wallet info
	wallet := &WalletInfo{
		Username:     username,
		ZcashAddress: zcashAddress,
		TotalFunded:  0,
		FundingCount: 0,
	}

	wm.wallets[username] = wallet

	// Save to disk
	if err := wm.save(); err != nil {
		return fmt.Errorf("failed to save wallet: %w", err)
	}

	return nil
}

// GetWallet returns wallet info for a user
func (wm *WalletManager) GetWallet(username string) (*WalletInfo, error) {
	wm.mu.RLock()
	defer wm.mu.RUnlock()

	wallet, exists := wm.wallets[username]
	if !exists {
		return nil, fmt.Errorf("wallet not found for user %s", username)
	}

	return wallet, nil
}

// RecordFunding records that a user received ZEC funding
func (wm *WalletManager) RecordFunding(username string, amount float64) error {
	wm.mu.Lock()
	defer wm.mu.Unlock()

	wallet, exists := wm.wallets[username]
	if !exists {
		return fmt.Errorf("wallet not found for user %s", username)
	}

	wallet.TotalFunded += amount
	wallet.FundingCount++

	// Save to disk
	if err := wm.save(); err != nil {
		return fmt.Errorf("failed to save wallet: %w", err)
	}

	return nil
}

// CanRequestFunding checks if a user can request more funding (100 ZEC limit)
func (wm *WalletManager) CanRequestFunding(username string, amount float64) (bool, float64, error) {
	wm.mu.RLock()
	defer wm.mu.RUnlock()

	wallet, exists := wm.wallets[username]
	if !exists {
		return false, 0, fmt.Errorf("wallet not found for user %s", username)
	}

	const maxFunding = 100.0
	remaining := maxFunding - wallet.TotalFunded

	if remaining <= 0 {
		return false, 0, nil
	}

	if amount > remaining {
		return false, remaining, nil
	}

	return true, remaining, nil
}

// load reads wallet data from disk
func (wm *WalletManager) load() error {
	walletsFile := filepath.Join(wm.dataDir, "wallets.json")

	// Check if file exists
	if _, err := os.Stat(walletsFile); os.IsNotExist(err) {
		// File doesn't exist, start with empty wallets
		return nil
	}

	// Read file
	data, err := os.ReadFile(walletsFile)
	if err != nil {
		return fmt.Errorf("failed to read wallets file: %w", err)
	}

	// Parse JSON
	var wallets map[string]*WalletInfo
	if err := json.Unmarshal(data, &wallets); err != nil {
		return fmt.Errorf("failed to parse wallets file: %w", err)
	}

	wm.wallets = wallets
	return nil
}

// save writes wallet data to disk
func (wm *WalletManager) save() error {
	walletsFile := filepath.Join(wm.dataDir, "wallets.json")

	// Marshal to JSON
	data, err := json.MarshalIndent(wm.wallets, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal wallets: %w", err)
	}

	// Write to file
	if err := os.WriteFile(walletsFile, data, 0600); err != nil {
		return fmt.Errorf("failed to write wallets file: %w", err)
	}

	return nil
}
