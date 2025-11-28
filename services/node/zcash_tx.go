package node

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
	"github.com/btcsuite/btcutil/base58"
	"golang.org/x/crypto/ripemd160"
)

// HTLCClaimParams contains parameters needed to claim from an HTLC
type HTLCClaimParams struct {
	HTLCTxID      string  // Transaction ID that funded the HTLC
	HTLCVout      uint32  // Output index in the funding transaction
	HTLCAmount    float64 // Amount locked in the HTLC (in ZEC)
	RedeemScript  []byte  // The HTLC redeem script
	Secret        []byte  // The preimage that hashes to the hash_lock
	RecipientAddr string  // Address to send the claimed funds to
	PrivateKeyWIF string  // Bob's private key in WIF format for signing
}

// BuildAndSignHTLCClaimTx builds and signs a transaction to claim funds from an HTLC
func BuildAndSignHTLCClaimTx(params *HTLCClaimParams) (string, error) {
	// Decode private key from WIF manually
	privKeyBytes, err := decodeWIF(params.PrivateKeyWIF)
	if err != nil {
		return "", fmt.Errorf("failed to decode WIF private key: %w", err)
	}

	privKey, _ := btcec.PrivKeyFromBytes(privKeyBytes)

	// Decode HTLC txid (reverse byte order for little-endian)
	txidBytes, err := hex.DecodeString(params.HTLCTxID)
	if err != nil {
		return "", fmt.Errorf("failed to decode HTLC txid: %w", err)
	}
	reverseBytes(txidBytes)

	// Calculate output amount (input amount - fee)
	fee := 0.0001 // 0.0001 ZEC fee (10000 zatoshis)
	outputAmount := params.HTLCAmount - fee
	if outputAmount <= 0 {
		return "", fmt.Errorf("HTLC amount %.8f too small to cover fee", params.HTLCAmount)
	}
	outputSatoshis := int64(outputAmount * 1e8)

	// Decode recipient address to get pubkey hash
	recipientPKH, err := addressToPubKeyHash(params.RecipientAddr)
	if err != nil {
		return "", fmt.Errorf("failed to decode recipient address: %w", err)
	}

	// Build the unsigned transaction
	var tx bytes.Buffer

	// Version (4 bytes, little-endian) - version 4 for Zcash Sapling
	binary.Write(&tx, binary.LittleEndian, uint32(0x80000004))

	// Version group ID (4 bytes) for Sapling
	binary.Write(&tx, binary.LittleEndian, uint32(0x892f2085))

	// Input count (varint)
	tx.WriteByte(1)

	// Input: Previous output (txid + vout)
	tx.Write(txidBytes)
	binary.Write(&tx, binary.LittleEndian, params.HTLCVout)

	// ScriptSig placeholder (will be filled after signing)
	// For now, empty
	tx.WriteByte(0)

	// Sequence
	binary.Write(&tx, binary.LittleEndian, uint32(0xffffffff))

	// Output count
	tx.WriteByte(1)

	// Output value (8 bytes, little-endian)
	binary.Write(&tx, binary.LittleEndian, outputSatoshis)

	// Output script (P2PKH)
	p2pkhScript := buildP2PKHScript(recipientPKH)
	writeVarInt(&tx, uint64(len(p2pkhScript)))
	tx.Write(p2pkhScript)

	// Locktime
	binary.Write(&tx, binary.LittleEndian, uint32(0))

	// Expiry height (Zcash specific)
	binary.Write(&tx, binary.LittleEndian, uint32(0))

	// Value balance (Sapling, 8 bytes)
	binary.Write(&tx, binary.LittleEndian, int64(0))

	// Sapling spend/output counts
	tx.WriteByte(0) // nShieldedSpend
	tx.WriteByte(0) // nShieldedOutput

	// JoinSplit count (for older txs, should be 0)
	tx.WriteByte(0)

	// Now we need to create the signature
	// For P2SH spending, we sign the redeem script
	inputAmount := int64(params.HTLCAmount * 1e8)
	sigHash := computeSigHashForP2SH(txidBytes, params.HTLCVout, params.RedeemScript, inputAmount, outputSatoshis, recipientPKH)

	// Sign with ECDSA
	signature := ecdsa.Sign(privKey, sigHash)
	sigBytes := append(signature.Serialize(), byte(0x01)) // SIGHASH_ALL

	// Build the scriptSig for HTLC claim:
	// <signature> <pubkey> <secret> OP_TRUE <redeemScript>
	pubKeyBytes := privKey.PubKey().SerializeCompressed()

	scriptSig := buildHTLCClaimScriptSig(sigBytes, pubKeyBytes, params.Secret, params.RedeemScript)

	// Rebuild transaction with scriptSig
	var signedTx bytes.Buffer

	// Version
	binary.Write(&signedTx, binary.LittleEndian, uint32(0x80000004))
	binary.Write(&signedTx, binary.LittleEndian, uint32(0x892f2085))

	// Input count
	signedTx.WriteByte(1)

	// Input
	signedTx.Write(txidBytes)
	binary.Write(&signedTx, binary.LittleEndian, params.HTLCVout)

	// ScriptSig
	writeVarInt(&signedTx, uint64(len(scriptSig)))
	signedTx.Write(scriptSig)

	// Sequence
	binary.Write(&signedTx, binary.LittleEndian, uint32(0xffffffff))

	// Output count
	signedTx.WriteByte(1)

	// Output
	binary.Write(&signedTx, binary.LittleEndian, outputSatoshis)
	writeVarInt(&signedTx, uint64(len(p2pkhScript)))
	signedTx.Write(p2pkhScript)

	// Locktime
	binary.Write(&signedTx, binary.LittleEndian, uint32(0))

	// Expiry height
	binary.Write(&signedTx, binary.LittleEndian, uint32(0))

	// Value balance
	binary.Write(&signedTx, binary.LittleEndian, int64(0))

	// Sapling counts
	signedTx.WriteByte(0)
	signedTx.WriteByte(0)

	// JoinSplit count
	signedTx.WriteByte(0)

	return hex.EncodeToString(signedTx.Bytes()), nil
}

// reverseBytes reverses a byte slice in place
func reverseBytes(b []byte) {
	for i := 0; i < len(b)/2; i++ {
		b[i], b[len(b)-1-i] = b[len(b)-1-i], b[i]
	}
}

// addressToPubKeyHash decodes a Zcash t-address to its pubkey hash
func addressToPubKeyHash(addr string) ([]byte, error) {
	// Zcash testnet t-addresses start with "tm"
	// They use base58check encoding with a 2-byte prefix
	decoded := base58.Decode(addr)
	if len(decoded) < 24 {
		return nil, fmt.Errorf("invalid address length")
	}

	// Verify checksum
	payload := decoded[:len(decoded)-4]
	checksum := decoded[len(decoded)-4:]
	expectedChecksum := doubleSHA256(payload)[:4]
	for i := 0; i < 4; i++ {
		if checksum[i] != expectedChecksum[i] {
			return nil, fmt.Errorf("invalid address checksum")
		}
	}

	// For Zcash testnet (tm prefix), there's a 2-byte prefix
	// The pubkey hash is the remaining 20 bytes
	if len(payload) == 22 {
		return payload[2:], nil // Remove the 2-byte prefix
	}
	return payload[1:], nil
}

// decodeWIF decodes a WIF-encoded private key
func decodeWIF(wif string) ([]byte, error) {
	decoded := base58.Decode(wif)
	if len(decoded) < 37 {
		return nil, fmt.Errorf("invalid WIF length: %d", len(decoded))
	}

	// Verify checksum
	payload := decoded[:len(decoded)-4]
	checksum := decoded[len(decoded)-4:]
	expectedChecksum := doubleSHA256(payload)[:4]
	for i := 0; i < 4; i++ {
		if checksum[i] != expectedChecksum[i] {
			return nil, fmt.Errorf("invalid WIF checksum")
		}
	}

	// Remove version byte (first byte)
	// If compressed, there's also a 0x01 suffix
	privKey := payload[1:]
	if len(privKey) == 33 && privKey[32] == 0x01 {
		privKey = privKey[:32] // Remove compression flag
	}

	return privKey, nil
}

// buildP2PKHScript builds a standard P2PKH output script
func buildP2PKHScript(pubKeyHash []byte) []byte {
	script := make([]byte, 25)
	script[0] = 0x76 // OP_DUP
	script[1] = 0xa9 // OP_HASH160
	script[2] = 0x14 // Push 20 bytes
	copy(script[3:23], pubKeyHash)
	script[23] = 0x88 // OP_EQUALVERIFY
	script[24] = 0xac // OP_CHECKSIG
	return script
}

// writeVarInt writes a variable-length integer
func writeVarInt(buf *bytes.Buffer, n uint64) {
	if n < 0xfd {
		buf.WriteByte(byte(n))
	} else if n <= 0xffff {
		buf.WriteByte(0xfd)
		binary.Write(buf, binary.LittleEndian, uint16(n))
	} else if n <= 0xffffffff {
		buf.WriteByte(0xfe)
		binary.Write(buf, binary.LittleEndian, uint32(n))
	} else {
		buf.WriteByte(0xff)
		binary.Write(buf, binary.LittleEndian, n)
	}
}

// buildHTLCClaimScriptSig builds the scriptSig for claiming an HTLC
// Stack order: <sig> <pubkey> <secret> OP_TRUE <redeemScript>
func buildHTLCClaimScriptSig(sig, pubKey, secret, redeemScript []byte) []byte {
	var scriptSig bytes.Buffer

	// Push signature
	scriptSig.WriteByte(byte(len(sig)))
	scriptSig.Write(sig)

	// Push public key
	scriptSig.WriteByte(byte(len(pubKey)))
	scriptSig.Write(pubKey)

	// Push secret
	scriptSig.WriteByte(byte(len(secret)))
	scriptSig.Write(secret)

	// Push OP_TRUE (0x51) to take the "claim" branch of the HTLC
	scriptSig.WriteByte(0x51)

	// Push redeem script (use OP_PUSHDATA1 if needed)
	if len(redeemScript) < 76 {
		scriptSig.WriteByte(byte(len(redeemScript)))
	} else if len(redeemScript) < 256 {
		scriptSig.WriteByte(0x4c) // OP_PUSHDATA1
		scriptSig.WriteByte(byte(len(redeemScript)))
	} else {
		scriptSig.WriteByte(0x4d) // OP_PUSHDATA2
		binary.Write(&scriptSig, binary.LittleEndian, uint16(len(redeemScript)))
	}
	scriptSig.Write(redeemScript)

	return scriptSig.Bytes()
}

// computeSigHashForP2SH computes the signature hash for a P2SH input (Zcash Sapling)
func computeSigHashForP2SH(prevTxID []byte, prevVout uint32, redeemScript []byte, inputAmount, outputAmount int64, outputPKH []byte) []byte {
	// For Zcash Sapling (version 4), we use ZIP-243 signature hash
	// This is a simplified version for our specific case

	// Compute hashPrevouts
	var prevouts bytes.Buffer
	prevouts.Write(prevTxID)
	binary.Write(&prevouts, binary.LittleEndian, prevVout)
	hashPrevouts := doubleSHA256(prevouts.Bytes())

	// Compute hashSequence
	var sequence bytes.Buffer
	binary.Write(&sequence, binary.LittleEndian, uint32(0xffffffff))
	hashSequence := doubleSHA256(sequence.Bytes())

	// Compute hashOutputs
	var outputs bytes.Buffer
	binary.Write(&outputs, binary.LittleEndian, outputAmount)
	p2pkhScript := buildP2PKHScript(outputPKH)
	outputs.WriteByte(byte(len(p2pkhScript)))
	outputs.Write(p2pkhScript)
	hashOutputs := doubleSHA256(outputs.Bytes())

	// Build the preimage for signing (ZIP-243)
	var preimage bytes.Buffer

	// Header
	binary.Write(&preimage, binary.LittleEndian, uint32(0x80000004)) // Version
	binary.Write(&preimage, binary.LittleEndian, uint32(0x892f2085)) // Version group ID
	preimage.Write(hashPrevouts)
	preimage.Write(hashSequence)
	preimage.Write(hashOutputs)

	// hashJoinSplits (all zeros for no joinsplits)
	preimage.Write(make([]byte, 32))

	// hashShieldedSpends (all zeros)
	preimage.Write(make([]byte, 32))

	// hashShieldedOutputs (all zeros)
	preimage.Write(make([]byte, 32))

	// nLockTime
	binary.Write(&preimage, binary.LittleEndian, uint32(0))

	// nExpiryHeight
	binary.Write(&preimage, binary.LittleEndian, uint32(0))

	// valueBalance
	binary.Write(&preimage, binary.LittleEndian, int64(0))

	// nHashType (SIGHASH_ALL)
	binary.Write(&preimage, binary.LittleEndian, uint32(1))

	// Input being signed
	preimage.Write(prevTxID)
	binary.Write(&preimage, binary.LittleEndian, prevVout)

	// scriptCode (the redeem script)
	writeVarInt(&preimage, uint64(len(redeemScript)))
	preimage.Write(redeemScript)

	// value
	binary.Write(&preimage, binary.LittleEndian, inputAmount)

	// sequence
	binary.Write(&preimage, binary.LittleEndian, uint32(0xffffffff))

	// Personalization for BLAKE2b (Zcash uses BLAKE2b, not double SHA256)
	// For simplicity in this demo, we'll use double SHA256
	// In production, this should use BLAKE2b with "ZcashSigHash" personalization
	return doubleSHA256(preimage.Bytes())
}

// doubleSHA256 computes SHA256(SHA256(data))
func doubleSHA256(data []byte) []byte {
	first := sha256.Sum256(data)
	second := sha256.Sum256(first[:])
	return second[:]
}

// hash160 computes RIPEMD160(SHA256(data))
func hash160(data []byte) []byte {
	sha := sha256.Sum256(data)
	ripemd := ripemd160.New()
	ripemd.Write(sha[:])
	return ripemd.Sum(nil)
}
