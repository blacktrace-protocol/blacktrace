// Package solana provides HTLC operations for Solana blockchain
package solana

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

// HTLCParams contains parameters for creating an HTLC
type HTLCParams struct {
	HashLock     [32]byte // SHA256 hash of secret
	Sender       string   // Sender's public key (base58)
	Receiver     string   // Receiver's public key (base58)
	TokenMint    string   // SPL Token mint address
	Amount       uint64   // Amount in smallest unit (lamports or token units)
	TimeoutSecs  int64    // Timeout in seconds from now
}

// HTLCState represents the current state of an HTLC
type HTLCState struct {
	HashLock  [32]byte
	Sender    string
	Receiver  string
	TokenMint string
	Amount    uint64
	Timeout   int64
	Claimed   bool
	Refunded  bool
}

// ComputeHashLock computes SHA256 hash of a secret
// This is compatible with Zcash's HTLC hash function
func ComputeHashLock(secret []byte) [32]byte {
	return sha256.Sum256(secret)
}

// ComputeHashLockFromString computes SHA256 hash from a string secret
func ComputeHashLockFromString(secret string) [32]byte {
	return sha256.Sum256([]byte(secret))
}

// HashLockToHex converts a hash lock to hex string
func HashLockToHex(hashLock [32]byte) string {
	return hex.EncodeToString(hashLock[:])
}

// HexToHashLock converts a hex string to hash lock bytes
func HexToHashLock(hexStr string) ([32]byte, error) {
	var hashLock [32]byte

	// Remove 0x prefix if present
	if len(hexStr) >= 2 && hexStr[:2] == "0x" {
		hexStr = hexStr[2:]
	}

	bytes, err := hex.DecodeString(hexStr)
	if err != nil {
		return hashLock, fmt.Errorf("failed to decode hex: %w", err)
	}

	if len(bytes) != 32 {
		return hashLock, fmt.Errorf("invalid hash lock length: expected 32, got %d", len(bytes))
	}

	copy(hashLock[:], bytes)
	return hashLock, nil
}

// VerifySecret verifies that SHA256(secret) equals the hash lock
func VerifySecret(secret []byte, hashLock [32]byte) bool {
	computed := sha256.Sum256(secret)
	return computed == hashLock
}

// HTLCManager manages HTLC operations on Solana
type HTLCManager struct {
	client    *Client
	programID string
}

// NewHTLCManager creates a new HTLC manager
func NewHTLCManager(client *Client, programID string) *HTLCManager {
	return &HTLCManager{
		client:    client,
		programID: programID,
	}
}

// CreateHTLC creates a new HTLC on Solana
// Note: In demo mode, this may simulate the HTLC by direct transfer
func (m *HTLCManager) CreateHTLC(params HTLCParams) (string, error) {
	// Calculate absolute timeout
	timeout := time.Now().Unix() + params.TimeoutSecs

	// Log HTLC creation
	fmt.Printf("Creating Solana HTLC:\n")
	fmt.Printf("  Hash Lock: %s\n", HashLockToHex(params.HashLock))
	fmt.Printf("  Sender: %s\n", params.Sender)
	fmt.Printf("  Receiver: %s\n", params.Receiver)
	fmt.Printf("  Amount: %d\n", params.Amount)
	fmt.Printf("  Timeout: %d (%s)\n", timeout, time.Unix(timeout, 0).Format(time.RFC3339))

	// TODO: Implement actual HTLC program call
	// For now, return a mock transaction signature
	//
	// In production, this would:
	// 1. Build the lock instruction with params
	// 2. Create and sign the transaction
	// 3. Send to Solana network
	// 4. Return transaction signature

	mockSignature := fmt.Sprintf("HTLC_LOCK_%s_%d", HashLockToHex(params.HashLock)[:16], time.Now().Unix())
	return mockSignature, nil
}

// ClaimHTLC claims an HTLC by revealing the secret
func (m *HTLCManager) ClaimHTLC(hashLock [32]byte, secret []byte) (string, error) {
	// Verify secret matches hash
	if !VerifySecret(secret, hashLock) {
		return "", fmt.Errorf("invalid secret: SHA256(secret) does not match hash lock")
	}

	fmt.Printf("Claiming Solana HTLC:\n")
	fmt.Printf("  Hash Lock: %s\n", HashLockToHex(hashLock))
	fmt.Printf("  Secret: %s\n", hex.EncodeToString(secret))

	// TODO: Implement actual HTLC program call
	// For now, return a mock transaction signature

	mockSignature := fmt.Sprintf("HTLC_CLAIM_%s_%d", HashLockToHex(hashLock)[:16], time.Now().Unix())
	return mockSignature, nil
}

// RefundHTLC refunds an HTLC after timeout
func (m *HTLCManager) RefundHTLC(hashLock [32]byte) (string, error) {
	fmt.Printf("Refunding Solana HTLC:\n")
	fmt.Printf("  Hash Lock: %s\n", HashLockToHex(hashLock))

	// TODO: Implement actual HTLC program call
	// For now, return a mock transaction signature

	mockSignature := fmt.Sprintf("HTLC_REFUND_%s_%d", HashLockToHex(hashLock)[:16], time.Now().Unix())
	return mockSignature, nil
}

// GetHTLCState fetches the current state of an HTLC
func (m *HTLCManager) GetHTLCState(hashLock [32]byte) (*HTLCState, error) {
	// Try to get HTLC details from the client
	// This requires the PDA address which is computed from hash_lock
	htlcAddress := "" // Would be computed from PDA seeds

	if htlcAddress == "" {
		// Return nil if HTLC doesn't exist
		return nil, fmt.Errorf("HTLC not found for hash lock: %s", HashLockToHex(hashLock))
	}

	details, err := m.client.GetHTLCDetails(htlcAddress)
	if err != nil {
		return nil, err
	}

	return &HTLCState{
		HashLock:  details.HashLock,
		Sender:    details.Sender,
		Receiver:  details.Receiver,
		TokenMint: details.TokenMint,
		Amount:    details.Amount,
		Timeout:   details.Timeout,
		Claimed:   details.Claimed,
		Refunded:  details.Refunded,
	}, nil
}
