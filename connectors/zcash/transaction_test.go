package zcash

import (
	"encoding/hex"
	"testing"
)

func TestBuildHTLCClaimScriptSig(t *testing.T) {
	// Test data - realistic values
	sig := make([]byte, 71) // DER signature + SIGHASH_ALL
	for i := range sig {
		sig[i] = byte(i)
	}

	pubKey := make([]byte, 33) // Compressed public key
	pubKey[0] = 0x02
	for i := 1; i < 33; i++ {
		pubKey[i] = byte(i)
	}

	secret := []byte("test12345678") // 12 byte secret

	redeemScript := make([]byte, 85) // Typical HTLC script size
	for i := range redeemScript {
		redeemScript[i] = byte(i)
	}

	scriptSig := buildHTLCClaimScriptSig(sig, pubKey, secret, redeemScript)

	// Verify structure
	pos := 0

	// Check signature push
	if scriptSig[pos] != byte(len(sig)) {
		t.Errorf("Expected sig length %d at pos 0, got %d", len(sig), scriptSig[pos])
	}
	pos += 1 + len(sig)

	// Check pubkey push
	if scriptSig[pos] != byte(len(pubKey)) {
		t.Errorf("Expected pubkey length %d at pos %d, got %d", len(pubKey), pos, scriptSig[pos])
	}
	pos += 1 + len(pubKey)

	// Check secret push
	if scriptSig[pos] != byte(len(secret)) {
		t.Errorf("Expected secret length %d at pos %d, got %d", len(secret), pos, scriptSig[pos])
	}
	pos += 1 + len(secret)

	// Check OP_TRUE
	if scriptSig[pos] != 0x51 {
		t.Errorf("Expected OP_TRUE (0x51) at pos %d, got 0x%02x", pos, scriptSig[pos])
	}
	pos++

	// Check redeemScript push (should use OP_PUSHDATA1 since len > 75)
	if len(redeemScript) < 76 {
		if scriptSig[pos] != byte(len(redeemScript)) {
			t.Errorf("Expected redeemScript length %d at pos %d, got %d", len(redeemScript), pos, scriptSig[pos])
		}
	} else {
		if scriptSig[pos] != 0x4c { // OP_PUSHDATA1
			t.Errorf("Expected OP_PUSHDATA1 (0x4c) at pos %d, got 0x%02x", pos, scriptSig[pos])
		}
		pos++
		if scriptSig[pos] != byte(len(redeemScript)) {
			t.Errorf("Expected redeemScript length %d at pos %d, got %d", len(redeemScript), pos, scriptSig[pos])
		}
	}

	t.Logf("ScriptSig built successfully, length: %d bytes", len(scriptSig))
	t.Logf("ScriptSig hex: %s", hex.EncodeToString(scriptSig))
}

func TestComputeHTLCSigHash(t *testing.T) {
	// Test with known values
	prevTxID, _ := hex.DecodeString("36d92529c13c53678aaf216210aa78e1631aa97ddfcfe792917f81a350f9b758")
	// Reverse for little-endian
	for i, j := 0, len(prevTxID)-1; i < j; i, j = i+1, j-1 {
		prevTxID[i], prevTxID[j] = prevTxID[j], prevTxID[i]
	}

	prevVout := uint32(0)

	// Simple redeem script for testing
	redeemScript := []byte{0x63, 0xa6, 0x14} // OP_IF OP_RIPEMD160 PUSH20
	redeemScript = append(redeemScript, make([]byte, 20)...)
	redeemScript = append(redeemScript, 0x88, 0x76, 0xa9, 0x14) // OP_EQUALVERIFY OP_DUP OP_HASH160 PUSH20
	redeemScript = append(redeemScript, make([]byte, 20)...)
	redeemScript = append(redeemScript, 0x67) // OP_ELSE
	redeemScript = append(redeemScript, 0x03, 0x01, 0x02, 0x03) // locktime
	redeemScript = append(redeemScript, 0xb1, 0x75, 0x76, 0xa9, 0x14) // OP_CLTV OP_DROP OP_DUP OP_HASH160 PUSH20
	redeemScript = append(redeemScript, make([]byte, 20)...)
	redeemScript = append(redeemScript, 0x68, 0x88, 0xac) // OP_ENDIF OP_EQUALVERIFY OP_CHECKSIG

	inputAmount := int64(100000000)  // 1 ZEC in zatoshis
	outputAmount := int64(99900000)  // 0.999 ZEC

	// P2PKH output script
	outputScript := buildP2PKHScript(make([]byte, 20))

	sigHash := computeHTLCSigHash(prevTxID, prevVout, redeemScript, inputAmount, outputAmount, outputScript)

	if len(sigHash) != 32 {
		t.Errorf("Expected 32-byte sighash, got %d bytes", len(sigHash))
	}

	t.Logf("SigHash: %s", hex.EncodeToString(sigHash))
}

func TestBuildRawTxWithScriptSig(t *testing.T) {
	prevTxID, _ := hex.DecodeString("36d92529c13c53678aaf216210aa78e1631aa97ddfcfe792917f81a350f9b758")
	// Reverse for little-endian
	for i, j := 0, len(prevTxID)-1; i < j; i, j = i+1, j-1 {
		prevTxID[i], prevTxID[j] = prevTxID[j], prevTxID[i]
	}

	prevVout := uint32(0)

	// Build a mock scriptSig
	scriptSig := []byte{0x47} // sig length
	scriptSig = append(scriptSig, make([]byte, 71)...) // mock sig
	scriptSig = append(scriptSig, 0x21) // pubkey length
	scriptSig = append(scriptSig, make([]byte, 33)...) // mock pubkey
	scriptSig = append(scriptSig, 0x08) // secret length
	scriptSig = append(scriptSig, []byte("secret12")...) // secret
	scriptSig = append(scriptSig, 0x51) // OP_TRUE
	scriptSig = append(scriptSig, 0x4c, 0x50) // OP_PUSHDATA1, 80 bytes
	scriptSig = append(scriptSig, make([]byte, 80)...) // mock redeemScript

	outputAmount := int64(99900000)
	outputScript := buildP2PKHScript(make([]byte, 20))

	txHex := buildRawTxWithScriptSig(prevTxID, prevVout, scriptSig, outputAmount, outputScript)

	// Decode and verify
	txBytes, err := hex.DecodeString(txHex)
	if err != nil {
		t.Fatalf("Failed to decode tx hex: %v", err)
	}

	// Check version
	if txBytes[0] != 0x01 || txBytes[1] != 0x00 || txBytes[2] != 0x00 || txBytes[3] != 0x00 {
		t.Error("Invalid version bytes")
	}

	// Check input count
	if txBytes[4] != 0x01 {
		t.Errorf("Expected 1 input, got %d", txBytes[4])
	}

	t.Logf("Built transaction: %d bytes", len(txBytes))
	t.Logf("TX hex: %s", txHex)
}

func TestDecodeWIF(t *testing.T) {
	// Test with a known regtest WIF
	// Regtest WIF starts with 'c' for compressed keys
	// This is a made-up test WIF - in real tests use actual test vectors

	// Test the base58Decode function first
	testWIF := "cTpAWUTzoqSqQjMEYcEWSbxkXXe3FYKVhMNzmCJDHWC8EQJQXLBM"
	decoded := base58Decode(testWIF)

	if len(decoded) < 37 {
		t.Logf("Decoded length: %d (expected >= 37 for compressed WIF)", len(decoded))
	} else {
		t.Logf("WIF decoded successfully, length: %d", len(decoded))

		// Try to decode as WIF
		privKey, err := decodeWIF(testWIF)
		if err != nil {
			t.Logf("WIF decode error (expected for test data): %v", err)
		} else {
			t.Logf("Private key: %s (length: %d)", hex.EncodeToString(privKey), len(privKey))
		}
	}
}

func TestBuildP2PKHScript(t *testing.T) {
	pubKeyHash, _ := hex.DecodeString("9ed15ea13a07dd5590d49419df5d185635211f2f")

	script := buildP2PKHScript(pubKeyHash)

	expected := "76a9149ed15ea13a07dd5590d49419df5d185635211f2f88ac"
	actual := hex.EncodeToString(script)

	if actual != expected {
		t.Errorf("P2PKH script mismatch\nExpected: %s\nGot:      %s", expected, actual)
	} else {
		t.Logf("P2PKH script: %s", actual)
	}
}
