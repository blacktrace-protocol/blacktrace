package starknet

import (
	"context"
	"fmt"
	"math/big"
	"testing"
	"time"
)

// Test configuration for local devnet
const (
	testRPCURL          = "http://localhost:5050"
	testContractAddress = "0x0305b946a388e416709b20b49b4919de92bebbf363b23887e1d14da4593d6204"
	testAccountAddress  = "0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691"
	testPrivateKey      = "0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9"
	testReceiverAddress = "0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1"
)

func TestNewHTLCClient(t *testing.T) {
	client, err := NewHTLCClient(
		testRPCURL,
		testContractAddress,
		testAccountAddress,
		testPrivateKey,
	)

	if err != nil {
		t.Fatalf("Failed to create HTLC client: %v", err)
	}

	if client == nil {
		t.Fatal("Client is nil")
	}

	expectedAddr, _ := HexToFelt(testContractAddress)
	if client.contractAddress.String() != expectedAddr.String() {
		t.Errorf("Expected contract address %s, got %s", expectedAddr.String(), client.contractAddress.String())
	}
}

func TestGetHTLCDetails(t *testing.T) {
	client, err := NewHTLCClient(
		testRPCURL,
		testContractAddress,
		testAccountAddress,
		testPrivateKey,
	)
	if err != nil {
		t.Fatalf("Failed to create HTLC client: %v", err)
	}

	ctx := context.Background()
	details, err := client.GetHTLCDetails(ctx)
	if err != nil {
		t.Fatalf("Failed to get HTLC details: %v", err)
	}

	if details == nil {
		t.Fatal("Details is nil")
	}

	// Print the current state
	t.Logf("HTLC Details:")
	t.Logf("  Hash Lock: %s", details.HashLock.String())
	t.Logf("  Sender: %s", details.Sender.String())
	t.Logf("  Receiver: %s", details.Receiver.String())
	t.Logf("  Amount: %s", details.Amount.String())
	t.Logf("  Timeout: %d", details.Timeout)
	t.Logf("  Claimed: %v", details.Claimed)
	t.Logf("  Refunded: %v", details.Refunded)
}

func TestLockHTLC(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	client, err := NewHTLCClient(
		testRPCURL,
		testContractAddress,
		testAccountAddress,
		testPrivateKey,
	)
	if err != nil {
		t.Fatalf("Failed to create HTLC client: %v", err)
	}

	ctx := context.Background()

	// Check if already locked
	details, err := client.GetHTLCDetails(ctx)
	if err != nil {
		t.Fatalf("Failed to get HTLC details: %v", err)
	}

	if details.Amount.Cmp(big.NewInt(0)) != 0 {
		t.Skipf("HTLC already locked with amount %s", details.Amount.String())
	}

	// Generate test data
	// Use a simple hash for testing (in production, use Pedersen hash)
	hashLock, _ := HexToFelt("0x04d5e2a36b64ec3e4b39e79b6a6ec1f3a2e3c1e8b5f9a2c1e8d5b9f2a3c1e8d5")
	receiver, _ := HexToFelt(testReceiverAddress)
	amount := big.NewInt(1000)
	timeout := uint64(time.Now().Unix() + 3600)

	// Lock STRK
	t.Logf("Locking HTLC with:")
	t.Logf("  Hash Lock: %s", hashLock.String())
	t.Logf("  Receiver: %s", receiver.String())
	t.Logf("  Timeout: %d", timeout)
	t.Logf("  Amount: %s", amount.String())

	txHash, err := client.Lock(ctx, hashLock, receiver, timeout, amount)
	if err != nil {
		t.Fatalf("Failed to lock HTLC: %v", err)
	}

	t.Logf("Lock transaction submitted: %s", txHash)

	// Wait for transaction to be mined
	t.Log("Waiting for transaction to be mined...")
	time.Sleep(5 * time.Second)

	// Verify the lock
	details, err = client.GetHTLCDetails(ctx)
	if err != nil {
		t.Fatalf("Failed to get HTLC details after lock: %v", err)
	}

	if details.Amount.Cmp(amount) != 0 {
		t.Errorf("Expected amount %s, got %s", amount.String(), details.Amount.String())
	}

	if details.Receiver.String() != receiver.String() {
		t.Errorf("Expected receiver %s, got %s", receiver.String(), details.Receiver.String())
	}

	t.Log("HTLC locked successfully!")
}

func TestIntegration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// This test demonstrates the full HTLC flow
	// Note: Run this test carefully as it modifies blockchain state

	client, err := NewHTLCClient(
		testRPCURL,
		testContractAddress,
		testAccountAddress,
		testPrivateKey,
	)
	if err != nil {
		t.Fatalf("Failed to create HTLC client: %v", err)
	}

	ctx := context.Background()

	// Step 1: Check initial state
	t.Log("Step 1: Checking initial state...")
	details, err := client.GetHTLCDetails(ctx)
	if err != nil {
		t.Fatalf("Failed to get HTLC details: %v", err)
	}
	t.Logf("Initial state: Amount=%s, Claimed=%v, Refunded=%v",
		details.Amount.String(), details.Claimed, details.Refunded)

	// Note: Actual lock/claim/refund tests should be run manually
	// to avoid interfering with the contract state during automated testing
	t.Log("Integration test complete. Run manual tests for lock/claim/refund.")
}

// Example usage function (not a test)
func ExampleHTLCClient_usage() {
	// Create client
	client, err := NewHTLCClient(
		"http://localhost:5050",
		"0x0305b946a388e416709b20b49b4919de92bebbf363b23887e1d14da4593d6204",
		"0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691",
		"0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9",
	)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	ctx := context.Background()

	// Get HTLC details
	details, err := client.GetHTLCDetails(ctx)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	fmt.Printf("HTLC Amount: %s\n", details.Amount.String())
	fmt.Printf("Claimed: %v\n", details.Claimed)
}
