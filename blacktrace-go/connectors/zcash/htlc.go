package zcash

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"

	"golang.org/x/crypto/ripemd160"
)

// Bitcoin Script opcodes
const (
	OP_IF                = 0x63
	OP_ELSE              = 0x67
	OP_ENDIF             = 0x68
	OP_DUP               = 0x76
	OP_HASH160           = 0xa9
	OP_RIPEMD160         = 0xa6
	OP_EQUALVERIFY       = 0x88
	OP_CHECKSIG          = 0xac
	OP_CHECKLOCKTIMEVERIFY = 0xb1
	OP_DROP              = 0x75
)

// HTLCScript represents an HTLC Bitcoin Script
type HTLCScript struct {
	SecretHash        []byte // 20-byte RIPEMD160(SHA256(secret))
	RecipientPubKeyHash []byte // 20-byte recipient public key hash
	RefundPubKeyHash  []byte // 20-byte refund public key hash
	Locktime          uint32 // Absolute locktime (block height or timestamp)
}

// BuildHTLCScript creates a Bitcoin Script for an HTLC
// The script allows:
// - Recipient to claim with secret before locktime
// - Sender to refund after locktime
//
// Script structure:
// OP_IF
//     OP_RIPEMD160 <hash> OP_EQUALVERIFY OP_DUP OP_HASH160 <recipient_pubkey_hash>
// OP_ELSE
//     <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP OP_DUP OP_HASH160 <refund_pubkey_hash>
// OP_ENDIF
// OP_EQUALVERIFY OP_CHECKSIG
func BuildHTLCScript(htlc *HTLCScript) ([]byte, error) {
	if len(htlc.SecretHash) != 20 {
		return nil, fmt.Errorf("secret hash must be 20 bytes (RIPEMD160)")
	}
	if len(htlc.RecipientPubKeyHash) != 20 {
		return nil, fmt.Errorf("recipient pubkey hash must be 20 bytes")
	}
	if len(htlc.RefundPubKeyHash) != 20 {
		return nil, fmt.Errorf("refund pubkey hash must be 20 bytes")
	}

	script := make([]byte, 0, 100)

	// OP_IF - Check if claiming with secret
	script = append(script, OP_IF)

	// Secret hash verification path
	script = append(script, OP_RIPEMD160)            // Hash the secret
	script = append(script, byte(len(htlc.SecretHash))) // Push length
	script = append(script, htlc.SecretHash...)      // Push hash
	script = append(script, OP_EQUALVERIFY)          // Verify hash matches

	// Verify recipient's signature
	script = append(script, OP_DUP)
	script = append(script, OP_HASH160)
	script = append(script, byte(len(htlc.RecipientPubKeyHash)))
	script = append(script, htlc.RecipientPubKeyHash...)

	// OP_ELSE - Refund path after locktime
	script = append(script, OP_ELSE)

	// Locktime verification
	script = append(script, encodeLocktime(htlc.Locktime)...)
	script = append(script, OP_CHECKLOCKTIMEVERIFY)
	script = append(script, OP_DROP)

	// Verify refund address signature
	script = append(script, OP_DUP)
	script = append(script, OP_HASH160)
	script = append(script, byte(len(htlc.RefundPubKeyHash)))
	script = append(script, htlc.RefundPubKeyHash...)

	// OP_ENDIF
	script = append(script, OP_ENDIF)

	// Final signature verification
	script = append(script, OP_EQUALVERIFY)
	script = append(script, OP_CHECKSIG)

	return script, nil
}

// encodeLocktime encodes a locktime value for Bitcoin Script
func encodeLocktime(locktime uint32) []byte {
	if locktime == 0 {
		return []byte{}
	}

	// Encode as little-endian with minimal bytes
	result := make([]byte, 0, 5)

	// Add length prefix
	if locktime <= 0xFF {
		result = append(result, 1)
		result = append(result, byte(locktime))
	} else if locktime <= 0xFFFF {
		result = append(result, 2)
		result = append(result, byte(locktime))
		result = append(result, byte(locktime>>8))
	} else if locktime <= 0xFFFFFF {
		result = append(result, 3)
		result = append(result, byte(locktime))
		result = append(result, byte(locktime>>8))
		result = append(result, byte(locktime>>16))
	} else {
		result = append(result, 4)
		result = append(result, byte(locktime))
		result = append(result, byte(locktime>>8))
		result = append(result, byte(locktime>>16))
		result = append(result, byte(locktime>>24))
	}

	return result
}

// ScriptToP2SHAddress converts a script to a P2SH address (Zcash format)
func ScriptToP2SHAddress(script []byte, network string) (string, error) {
	// Hash the script: RIPEMD160(SHA256(script))
	shaHash := sha256.Sum256(script)
	ripemdHasher := ripemd160.New()
	ripemdHasher.Write(shaHash[:])
	scriptHash := ripemdHasher.Sum(nil)

	// Zcash uses 2-byte version prefixes for P2SH addresses
	// Mainnet: [0x1C, 0xBD]
	// Testnet/Regtest: [0x1C, 0xBA]
	var versionBytes []byte
	if network == "regtest" || network == "testnet" {
		versionBytes = []byte{0x1C, 0xBA}
		log.Printf("DEBUG: Network=%s, Using Zcash version bytes: %x (len=%d)\n", network, versionBytes, len(versionBytes))
	} else {
		versionBytes = []byte{0x1C, 0xBD}
		log.Printf("DEBUG: Network=%s, Using Zcash version bytes: %x (len=%d)\n", network, versionBytes, len(versionBytes))
	}

	// Build address: version_bytes + script_hash
	addressBytes := make([]byte, 0, len(versionBytes)+len(scriptHash)+4)
	addressBytes = append(addressBytes, versionBytes...)
	addressBytes = append(addressBytes, scriptHash...)

	// Calculate checksum: first 4 bytes of SHA256(SHA256(version + script_hash))
	checksum1 := sha256.Sum256(addressBytes)
	checksum2 := sha256.Sum256(checksum1[:])
	checksum := checksum2[:4]

	// Append checksum
	addressBytes = append(addressBytes, checksum...)

	// Encode as Base58
	return base58Encode(addressBytes), nil
}

// base58Encode encodes bytes to Base58 (Bitcoin-style)
func base58Encode(input []byte) string {
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

	// Convert to big integer
	num := new(big.Int).SetBytes(input)
	zero := big.NewInt(0)
	fiftyEight := big.NewInt(58)
	remainder := new(big.Int)

	// Encode
	encoded := ""
	for num.Cmp(zero) > 0 {
		num.DivMod(num, fiftyEight, remainder)
		encoded = string(alphabet[remainder.Int64()]) + encoded
	}

	// Add leading '1's for leading zeros
	for _, b := range input {
		if b != 0 {
			break
		}
		encoded = "1" + encoded
	}

	return encoded
}

// Hash160 computes RIPEMD160(SHA256(data))
func Hash160(data []byte) []byte {
	shaHash := sha256.Sum256(data)
	ripemdHasher := ripemd160.New()
	ripemdHasher.Write(shaHash[:])
	return ripemdHasher.Sum(nil)
}

// DecodeHex decodes a hex string to bytes
func DecodeHex(hexStr string) ([]byte, error) {
	return hex.DecodeString(hexStr)
}

// EncodeHex encodes bytes to hex string
func EncodeHex(data []byte) string {
	return hex.EncodeToString(data)
}
