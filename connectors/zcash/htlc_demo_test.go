package zcash

import (
	"encoding/hex"
	"fmt"
	"testing"
)

// TestHTLCEndToEnd demonstrates the complete HTLC flow:
// 1. Alice creates HTLC with secret hash
// 2. Alice locks funds to P2SH address
// 3. Bob claims funds by revealing secret
//
// Run with: go test -v -run TestHTLCEndToEnd ./connectors/zcash/
func TestHTLCEndToEnd(t *testing.T) {
	fmt.Println("=== Zcash HTLC End-to-End Demo ===")
	fmt.Println()

	// Step 1: Define the secret (only Alice knows this initially)
	secret := []byte("blacktrace_atomic_swap_secret_42")
	fmt.Printf("1. SECRET (known only to Alice): %s\n", string(secret))
	fmt.Printf("   Secret hex: %s\n", hex.EncodeToString(secret))

	// Step 2: Compute the hash lock (Hash160 = RIPEMD160(SHA256(secret)))
	secretHash := Hash160(secret)
	fmt.Printf("\n2. HASH LOCK (shared publicly): %s\n", hex.EncodeToString(secretHash))
	fmt.Println("   This hash is used in the HTLC script - anyone can see it")
	fmt.Println("   But only someone with the secret can claim the funds")

	// Step 3: Define participant public key hashes (simulated)
	// In real usage, these come from actual wallet addresses
	bobPubKeyHash, _ := hex.DecodeString("89abcdef0123456789abcdef0123456789abcdef")
	alicePubKeyHash, _ := hex.DecodeString("0123456789abcdef0123456789abcdef01234567")

	fmt.Printf("\n3. PARTICIPANTS:\n")
	fmt.Printf("   Alice (sender/refund): %s\n", hex.EncodeToString(alicePubKeyHash))
	fmt.Printf("   Bob (receiver/claimer): %s\n", hex.EncodeToString(bobPubKeyHash))

	// Step 4: Set locktime (e.g., block 1000 for regtest)
	locktime := uint32(1000)
	fmt.Printf("\n4. LOCKTIME: Block %d\n", locktime)
	fmt.Println("   After this block, Alice can refund if Bob hasn't claimed")

	// Step 5: Build the HTLC script
	htlcScript := &HTLCScript{
		SecretHash:        secretHash,
		RecipientPubKeyHash: bobPubKeyHash,
		RefundPubKeyHash:  alicePubKeyHash,
		Locktime:          locktime,
	}

	script, err := BuildHTLCScript(htlcScript)
	if err != nil {
		t.Fatalf("Failed to build HTLC script: %v", err)
	}

	fmt.Printf("\n5. HTLC SCRIPT (Bitcoin Script):\n")
	fmt.Printf("   Hex: %s\n", hex.EncodeToString(script))
	fmt.Printf("   Length: %d bytes\n", len(script))

	// Decode and explain the script
	fmt.Println("\n   Script breakdown:")
	fmt.Println("   OP_IF                      ; If claiming with secret")
	fmt.Println("     OP_SHA256                ; Hash the provided secret")
	fmt.Println("     OP_RIPEMD160             ; Then RIPEMD160")
	fmt.Println("     <20-byte hash>           ; Push expected hash")
	fmt.Println("     OP_EQUALVERIFY           ; Verify hash matches")
	fmt.Println("     OP_DUP OP_HASH160        ; Standard P2PKH")
	fmt.Println("     <bob_pubkey_hash>        ; Bob's pubkey hash")
	fmt.Println("   OP_ELSE                    ; Else (refund path)")
	fmt.Println("     <locktime>               ; Push locktime")
	fmt.Println("     OP_CHECKLOCKTIMEVERIFY   ; Verify time has passed")
	fmt.Println("     OP_DROP                  ; Clean up stack")
	fmt.Println("     OP_DUP OP_HASH160        ; Standard P2PKH")
	fmt.Println("     <alice_pubkey_hash>      ; Alice's pubkey hash")
	fmt.Println("   OP_ENDIF")
	fmt.Println("   OP_EQUALVERIFY OP_CHECKSIG ; Verify signature")

	// Step 6: Generate P2SH address
	p2shAddress, err := ScriptToP2SHAddress(script, "regtest")
	if err != nil {
		t.Fatalf("Failed to create P2SH address: %v", err)
	}

	fmt.Printf("\n6. P2SH ADDRESS (where funds are locked):\n")
	fmt.Printf("   %s\n", p2shAddress)
	fmt.Println("   Alice sends funds to this address")

	// Step 7: Demonstrate claim path
	fmt.Println("\n7. CLAIM PATH (Bob reveals secret):")
	fmt.Println("   Bob provides scriptSig: <signature> <pubkey> <secret> OP_TRUE <redeemScript>")
	fmt.Printf("   Secret to reveal: %s\n", string(secret))

	// Verify the secret hashes correctly
	verifyHash := Hash160(secret)
	if hex.EncodeToString(verifyHash) == hex.EncodeToString(secretHash) {
		fmt.Println("   ✅ Hash verification PASSED - secret is valid")
	} else {
		fmt.Println("   ❌ Hash verification FAILED")
	}

	// Step 8: Demonstrate refund path
	fmt.Println("\n8. REFUND PATH (after locktime expires):")
	fmt.Printf("   If block >= %d and Bob hasn't claimed:\n", locktime)
	fmt.Println("   Alice provides scriptSig: <signature> <pubkey> OP_FALSE <redeemScript>")
	fmt.Println("   Alice gets her funds back")

	fmt.Println("\n=== HTLC Demo Complete ===")
	fmt.Println()
	fmt.Println("KEY SECURITY PROPERTIES:")
	fmt.Println("1. Bob can only claim by revealing the secret (hash preimage)")
	fmt.Println("2. Once secret is revealed on-chain, Alice can use it on Starknet/Solana")
	fmt.Println("3. If Bob doesn't claim before locktime, Alice can refund")
	fmt.Println("4. The atomic swap is trustless - neither party can cheat")
}

// TestSecretHashVerification verifies the hashing works correctly
func TestSecretHashVerification(t *testing.T) {
	testCases := []struct {
		secret string
	}{
		{"hello"},
		{"atomic_swap_secret"},
		{"a"},
		{"this is a longer secret with spaces and numbers 12345"},
	}

	for _, tc := range testCases {
		secret := []byte(tc.secret)
		hash := Hash160(secret)

		// Verify hash is always 20 bytes
		if len(hash) != 20 {
			t.Errorf("Hash160(%s) returned %d bytes, expected 20", tc.secret, len(hash))
		}

		// Verify same input gives same output
		hash2 := Hash160(secret)
		if hex.EncodeToString(hash) != hex.EncodeToString(hash2) {
			t.Errorf("Hash160 not deterministic for input: %s", tc.secret)
		}

		fmt.Printf("Secret: %-50s -> Hash160: %s\n", tc.secret, hex.EncodeToString(hash))
	}
}

// TestHTLCScriptValidation tests various HTLC script scenarios
func TestHTLCScriptValidation(t *testing.T) {
	// Valid HTLC
	validHTLC := &HTLCScript{
		SecretHash:        make([]byte, 20),
		RecipientPubKeyHash: make([]byte, 20),
		RefundPubKeyHash:  make([]byte, 20),
		Locktime:          1000,
	}

	script, err := BuildHTLCScript(validHTLC)
	if err != nil {
		t.Fatalf("Valid HTLC should not fail: %v", err)
	}
	fmt.Printf("Valid HTLC script length: %d bytes\n", len(script))

	// Invalid: wrong hash length
	invalidHTLC := &HTLCScript{
		SecretHash:        make([]byte, 32), // Wrong - should be 20
		RecipientPubKeyHash: make([]byte, 20),
		RefundPubKeyHash:  make([]byte, 20),
		Locktime:          1000,
	}

	_, err = BuildHTLCScript(invalidHTLC)
	if err == nil {
		t.Error("Should fail with 32-byte secret hash")
	} else {
		fmt.Printf("Correctly rejected 32-byte hash: %v\n", err)
	}
}

// TestP2SHAddressGeneration tests P2SH address generation for different networks
func TestP2SHAddressGeneration(t *testing.T) {
	// Create a sample script
	script := []byte{0x63, 0xa8, 0xa6, 0x14} // Partial HTLC script for testing

	networks := []string{"regtest", "testnet", "mainnet"}
	for _, network := range networks {
		addr, err := ScriptToP2SHAddress(script, network)
		if err != nil {
			t.Errorf("Failed to generate P2SH for %s: %v", network, err)
			continue
		}
		fmt.Printf("Network: %-10s P2SH Address: %s\n", network, addr)
	}
}
