package zcash

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"math"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
)

// CreateHTLCLockTransaction creates a transaction that locks funds to an HTLC P2SH address
func (c *Client) CreateHTLCLockTransaction(fromAddress string, htlcAddress string, amount float64) (string, error) {
	// Get unspent outputs from the sender's address
	utxos, err := c.ListUnspent(1, 9999999)
	if err != nil {
		return "", fmt.Errorf("failed to list unspent outputs: %w", err)
	}

	// Filter UTXOs for the from address and find sufficient funds
	var selectedUTXOs []UTXO
	var totalInput float64
	for _, utxo := range utxos {
		if utxo.Address == fromAddress && utxo.Spendable {
			selectedUTXOs = append(selectedUTXOs, utxo)
			totalInput += utxo.Amount
			if totalInput >= amount+0.0001 { // amount + small fee
				break
			}
		}
	}

	if totalInput < amount+0.0001 {
		return "", fmt.Errorf("insufficient funds: have %.8f ZEC, need %.8f ZEC", totalInput, amount+0.0001)
	}

	// Build transaction inputs
	inputs := make([]TxInput, len(selectedUTXOs))
	for i, utxo := range selectedUTXOs {
		inputs[i] = TxInput{
			Txid: utxo.Txid,
			Vout: utxo.Vout,
		}
	}

	// Build transaction outputs
	outputs := make(TxOutput)
	outputs[htlcAddress] = amount

	// Add change output if necessary
	fee := 0.0001 // 0.0001 ZEC fee
	change := totalInput - amount - fee
	// Round to 8 decimal places to avoid floating point precision issues
	change = math.Round(change*1e8) / 1e8
	if change > 0.00001 { // Only add change if > dust threshold
		outputs[fromAddress] = change
	}

	// Create raw transaction
	rawTx, err := c.CreateRawTransaction(inputs, outputs)
	if err != nil {
		return "", fmt.Errorf("failed to create raw transaction: %w", err)
	}

	// Sign the transaction
	signResult, err := c.SignRawTransaction(rawTx)
	if err != nil {
		return "", fmt.Errorf("failed to sign transaction: %w", err)
	}

	if !signResult.Complete {
		return "", fmt.Errorf("transaction signing incomplete")
	}

	return signResult.Hex, nil
}

// BroadcastTransaction broadcasts a signed transaction to the network
func (c *Client) BroadcastTransaction(signedTx string) (string, error) {
	txid, err := c.SendRawTransaction(signedTx)
	if err != nil {
		return "", fmt.Errorf("failed to broadcast transaction: %w", err)
	}
	return txid, nil
}

// CreateAndBroadcastHTLCLock is a convenience function that creates and broadcasts an HTLC lock transaction
func (c *Client) CreateAndBroadcastHTLCLock(fromAddress string, htlcAddress string, amount float64) (string, error) {
	// Create the transaction
	signedTx, err := c.CreateHTLCLockTransaction(fromAddress, htlcAddress, amount)
	if err != nil {
		return "", err
	}

	// Broadcast it
	txid, err := c.BroadcastTransaction(signedTx)
	if err != nil {
		return "", err
	}

	return txid, nil
}

// GetAddressFromPubKeyHash gets an address from a pubkey hash
// This is a helper for testing - in production, addresses would be provided by users
func GetAddressFromPubKeyHash(pubKeyHash []byte, network string) (string, error) {
	// Add version byte (0x00 for mainnet P2PKH, 0x6f for testnet/regtest)
	var versionByte byte
	if network == "regtest" || network == "testnet" {
		versionByte = 0x6f
	} else {
		versionByte = 0x00
	}

	// Build address: version + pubkey_hash + checksum
	addressBytes := make([]byte, 1+len(pubKeyHash))
	addressBytes[0] = versionByte
	copy(addressBytes[1:], pubKeyHash)

	// Calculate checksum
	checksum1 := Hash256(addressBytes)
	checksum2 := Hash256(checksum1)
	checksum := checksum2[:4]

	// Append checksum
	addressBytes = append(addressBytes, checksum...)

	// Encode as Base58
	return base58Encode(addressBytes), nil
}

// Hash256 computes SHA256(SHA256(data))
func Hash256(data []byte) []byte {
	first := sha256.Sum256(data)
	second := sha256.Sum256(first[:])
	return second[:]
}

// HTLCClaimParams contains parameters needed to claim from an HTLC
type HTLCClaimParams struct {
	HTLCTxID      string  // Transaction ID that funded the HTLC
	HTLCVout      uint32  // Output index in the funding transaction
	HTLCAmount    float64 // Amount locked in the HTLC
	RedeemScript  []byte  // The HTLC redeem script
	Secret        []byte  // The preimage that hashes to the hash_lock
	RecipientAddr string  // Address to send the claimed funds to
}

// CreateHTLCClaimTransaction creates a transaction to claim funds from an HTLC
// by providing the secret (preimage)
func (c *Client) CreateHTLCClaimTransaction(params *HTLCClaimParams) (string, error) {
	// Build transaction input (spending from the HTLC)
	inputs := []TxInput{
		{
			Txid: params.HTLCTxID,
			Vout: params.HTLCVout,
		},
	}

	// Build transaction output (sending to recipient minus fee)
	fee := 0.0001 // 0.0001 ZEC fee
	outputAmount := math.Round((params.HTLCAmount-fee)*1e8) / 1e8
	if outputAmount <= 0 {
		return "", fmt.Errorf("HTLC amount too small to cover fee")
	}

	outputs := make(TxOutput)
	outputs[params.RecipientAddr] = outputAmount

	// Create raw transaction
	rawTx, err := c.CreateRawTransaction(inputs, outputs)
	if err != nil {
		return "", fmt.Errorf("failed to create raw transaction: %w", err)
	}

	// For P2SH transactions, we need to provide the redeemScript to signrawtransaction
	// The prevtxs parameter tells the signer about the output being spent
	prevTxs := []map[string]interface{}{
		{
			"txid":         params.HTLCTxID,
			"vout":         params.HTLCVout,
			"scriptPubKey": c.scriptPubKeyForP2SH(params.RedeemScript),
			"redeemScript": EncodeHex(params.RedeemScript),
			"amount":       params.HTLCAmount,
		},
	}

	// Sign the transaction with the redeemScript
	signResult, err := c.SignRawTransactionWithPrevTxs(rawTx, prevTxs)
	if err != nil {
		return "", fmt.Errorf("failed to sign transaction: %w", err)
	}

	// The signature from signrawtransaction won't be complete because
	// the wallet doesn't know how to construct the scriptSig for the HTLC.
	// We need to manually construct the scriptSig with the secret.

	// For now, return the partially signed tx - we'll need to add the secret
	// to the scriptSig manually
	return signResult.Hex, nil
}

// scriptPubKeyForP2SH computes the scriptPubKey for a P2SH address from the redeemScript
func (c *Client) scriptPubKeyForP2SH(redeemScript []byte) string {
	// P2SH scriptPubKey is: OP_HASH160 <20-byte-script-hash> OP_EQUAL
	// Script hash is RIPEMD160(SHA256(redeemScript))
	scriptHash := Hash160(redeemScript)

	// Build scriptPubKey: OP_HASH160 (0xa9) + push 20 bytes (0x14) + hash + OP_EQUAL (0x87)
	scriptPubKey := make([]byte, 0, 23)
	scriptPubKey = append(scriptPubKey, 0xa9)        // OP_HASH160
	scriptPubKey = append(scriptPubKey, 0x14)        // Push 20 bytes
	scriptPubKey = append(scriptPubKey, scriptHash...) // 20-byte hash
	scriptPubKey = append(scriptPubKey, 0x87)        // OP_EQUAL

	return EncodeHex(scriptPubKey)
}

// SignRawTransactionWithPrevTxs signs a raw transaction with previous transaction info
func (c *Client) SignRawTransactionWithPrevTxs(rawTx string, prevTxs []map[string]interface{}) (*SignRawTransactionResult, error) {
	result, err := c.call("signrawtransaction", rawTx, prevTxs)
	if err != nil {
		return nil, err
	}

	var signResult SignRawTransactionResult
	if err := json.Unmarshal(result, &signResult); err != nil {
		return nil, fmt.Errorf("failed to unmarshal sign result: %w", err)
	}

	return &signResult, nil
}

// ClaimHTLC claims funds from an HTLC by providing the secret
// This builds a proper P2SH claim transaction with the custom scriptSig
func (c *Client) ClaimHTLC(params *HTLCClaimParams) (string, error) {
	log.Printf("Claiming HTLC: txid=%s, vout=%d, amount=%.8f", params.HTLCTxID, params.HTLCVout, params.HTLCAmount)
	log.Printf("  Secret: %s", EncodeHex(params.Secret))
	log.Printf("  Recipient: %s", params.RecipientAddr)

	// Verify the secret hashes correctly
	// HTLC uses RIPEMD160(SHA256(secret)), which is Hash160
	secretHash := Hash160(params.Secret)
	log.Printf("  Secret hash (Hash160 = RIPEMD160(SHA256)): %s", EncodeHex(secretHash))

	// Get Bob's public key from the recipient address (key must be imported first)
	addrInfo, err := c.ValidateAddress(params.RecipientAddr)
	if err != nil {
		return "", fmt.Errorf("failed to validate recipient address: %w", err)
	}
	pubKeyHex, ok := addrInfo["pubkey"].(string)
	if !ok || pubKeyHex == "" {
		return "", fmt.Errorf("could not get public key for recipient address (make sure key is imported)")
	}
	pubKey, err := DecodeHex(pubKeyHex)
	if err != nil {
		return "", fmt.Errorf("failed to decode public key: %w", err)
	}
	log.Printf("  Recipient pubkey: %s", pubKeyHex)

	// Build transaction input
	inputs := []TxInput{
		{
			Txid: params.HTLCTxID,
			Vout: params.HTLCVout,
		},
	}

	// Build transaction output with fee
	// HTLC claim tx is ~300 bytes, needs at least 0.0003 ZEC (100 zat/byte)
	fee := 0.001 // 0.001 ZEC fee to ensure relay
	outputAmount := math.Round((params.HTLCAmount-fee)*1e8) / 1e8
	if outputAmount <= 0 {
		return "", fmt.Errorf("HTLC amount %.8f too small to cover fee", params.HTLCAmount)
	}

	outputs := make(TxOutput)
	outputs[params.RecipientAddr] = outputAmount

	// Create raw transaction
	rawTx, err := c.CreateRawTransaction(inputs, outputs)
	if err != nil {
		return "", fmt.Errorf("failed to create raw transaction: %w", err)
	}
	log.Printf("  Raw TX (unsigned): %s", rawTx)

	// Sign the transaction - this gives us a signature but not the complete scriptSig
	// We need to provide prevTxs so the wallet knows about the P2SH output
	prevTxs := []map[string]interface{}{
		{
			"txid":         params.HTLCTxID,
			"vout":         params.HTLCVout,
			"scriptPubKey": c.scriptPubKeyForP2SH(params.RedeemScript),
			"redeemScript": EncodeHex(params.RedeemScript),
			"amount":       params.HTLCAmount,
		},
	}

	signResult, err := c.SignRawTransactionWithPrevTxs(rawTx, prevTxs)
	if err != nil {
		return "", fmt.Errorf("failed to sign transaction: %w", err)
	}
	log.Printf("  Initial sign complete: %v", signResult.Complete)

	// If signing was complete, the wallet managed to sign it (unlikely for custom P2SH)
	// More likely, we need to extract the signature and build custom scriptSig
	var finalTxHex string
	if signResult.Complete {
		finalTxHex = signResult.Hex
	} else {
		// Build custom scriptSig for HTLC claim:
		// <signature> <pubkey> <secret> OP_TRUE <redeemScript>
		// First, try to get signature from the partial result, or sign differently

		// Use signmessage approach to get a signature for the sighash
		// Actually, for regtest demo, let's try a different approach:
		// Create a dummy P2PKH output, sign it, extract sig, then rebuild with HTLC scriptSig

		// For now, let's try broadcasting what we have and see the detailed error
		log.Printf("  Attempting to build custom scriptSig for HTLC claim...")

		// Get signature by signing with the key directly
		// The signrawtransaction should have attempted to sign even if incomplete
		// Let's decode the tx and check what we got
		decodedTx, decErr := c.DecodeRawTransaction(signResult.Hex)
		if decErr != nil {
			log.Printf("  Could not decode signed tx: %v", decErr)
		} else {
			log.Printf("  Decoded signed TX: %+v", decodedTx)
		}

		// Try using fundrawtransaction + signrawtransaction approach
		// Or build the scriptSig manually using the signature we can extract

		// For the demo, let's use a workaround: create a fully funded tx and sign with SIGHASH_ALL
		finalTxHex, err = c.buildHTLCClaimTxManually(params, pubKey, outputAmount)
		if err != nil {
			return "", fmt.Errorf("failed to build HTLC claim tx manually: %w", err)
		}
	}

	log.Printf("  Final TX: %s", finalTxHex)

	// Broadcast the transaction
	txid, err := c.BroadcastTransaction(finalTxHex)
	if err != nil {
		return "", fmt.Errorf("failed to broadcast claim transaction: %w", err)
	}

	log.Printf("✅ HTLC Claim broadcast: %s", txid)
	return txid, nil
}

// buildHTLCClaimTxManually builds an HTLC claim transaction with proper scriptSig
func (c *Client) buildHTLCClaimTxManually(params *HTLCClaimParams, pubKey []byte, outputAmount float64) (string, error) {
	// Decode the HTLC txid
	txidBytes, err := DecodeHex(params.HTLCTxID)
	if err != nil {
		return "", fmt.Errorf("failed to decode HTLC txid: %w", err)
	}
	// Reverse for little-endian
	for i, j := 0, len(txidBytes)-1; i < j; i, j = i+1, j-1 {
		txidBytes[i], txidBytes[j] = txidBytes[j], txidBytes[i]
	}

	// Get recipient pubkey hash
	recipientPKH := Hash160(pubKey)

	// Convert output amount to satoshis
	outputSatoshis := int64(outputAmount * 1e8)
	inputSatoshis := int64(params.HTLCAmount * 1e8)

	// Build P2PKH output script
	p2pkhScript := buildP2PKHScript(recipientPKH)

	// Compute the signature hash for the input
	sigHash := computeHTLCSigHash(txidBytes, params.HTLCVout, params.RedeemScript, inputSatoshis, outputSatoshis, p2pkhScript)
	log.Printf("  SigHash: %s", EncodeHex(sigHash))

	// Sign the hash using the wallet's signmessage or by extracting from a test sign
	// For regtest, we can use the RPC to sign
	signature, err := c.signHashWithWallet(params.RecipientAddr, sigHash)
	if err != nil {
		return "", fmt.Errorf("failed to sign hash: %w", err)
	}
	log.Printf("  Signature: %s", EncodeHex(signature))

	// Build the scriptSig: <sig> <pubkey> <secret> OP_TRUE <redeemScript>
	scriptSig := buildHTLCClaimScriptSig(signature, pubKey, params.Secret, params.RedeemScript)
	log.Printf("  ScriptSig length: %d", len(scriptSig))

	// Build the complete transaction
	txHex := buildRawTxWithScriptSig(txidBytes, params.HTLCVout, scriptSig, outputSatoshis, p2pkhScript)

	return txHex, nil
}

// signHashWithWallet signs a hash using the wallet's key for an address
func (c *Client) signHashWithWallet(address string, hash []byte) ([]byte, error) {
	// Zcash doesn't have a direct "sign hash" RPC, so we need to use signrawtransaction
	// and extract the signature from the result.
	//
	// Alternative: Use the dumpprivkey to get the private key and sign locally
	privKeyWIF, err := c.DumpPrivKey(address)
	if err != nil {
		return nil, fmt.Errorf("failed to dump private key: %w", err)
	}

	// Decode WIF to get raw private key
	privKeyBytes, err := decodeWIF(privKeyWIF)
	if err != nil {
		return nil, fmt.Errorf("failed to decode WIF: %w", err)
	}

	// Sign the hash using ECDSA
	signature, err := signECDSA(privKeyBytes, hash)
	if err != nil {
		return nil, fmt.Errorf("failed to sign: %w", err)
	}

	// Append SIGHASH_ALL byte
	signature = append(signature, 0x01)
	return signature, nil
}

// decodeWIF decodes a WIF-encoded private key
func decodeWIF(wif string) ([]byte, error) {
	decoded := base58Decode(wif)
	if len(decoded) < 37 {
		return nil, fmt.Errorf("invalid WIF length: %d", len(decoded))
	}

	// Verify checksum
	payload := decoded[:len(decoded)-4]
	checksum := decoded[len(decoded)-4:]
	expectedChecksum := Hash256(payload)[:4]
	for i := 0; i < 4; i++ {
		if checksum[i] != expectedChecksum[i] {
			return nil, fmt.Errorf("invalid WIF checksum")
		}
	}

	// Remove version byte (first byte)
	// If compressed key (33 bytes with 0x01 suffix), remove the suffix
	privKey := payload[1:]
	if len(privKey) == 33 && privKey[32] == 0x01 {
		privKey = privKey[:32]
	}

	return privKey, nil
}

// signECDSA signs a hash with ECDSA using the secp256k1 curve
func signECDSA(privKey, hash []byte) ([]byte, error) {
	// Use btcec for ECDSA signing
	// Import is already available from the btcec package
	key, _ := btcec.PrivKeyFromBytes(privKey)
	sig := ecdsa.Sign(key, hash)
	return sig.Serialize(), nil
}

// buildP2PKHScript builds a P2PKH output script
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

// buildHTLCClaimScriptSig builds the scriptSig for claiming an HTLC
func buildHTLCClaimScriptSig(sig, pubKey, secret, redeemScript []byte) []byte {
	scriptSig := make([]byte, 0, len(sig)+len(pubKey)+len(secret)+len(redeemScript)+10)

	// Push signature
	scriptSig = append(scriptSig, byte(len(sig)))
	scriptSig = append(scriptSig, sig...)

	// Push public key
	scriptSig = append(scriptSig, byte(len(pubKey)))
	scriptSig = append(scriptSig, pubKey...)

	// Push secret
	scriptSig = append(scriptSig, byte(len(secret)))
	scriptSig = append(scriptSig, secret...)

	// Push OP_TRUE (0x51) to take the claim branch
	scriptSig = append(scriptSig, 0x51)

	// Push redeem script (use OP_PUSHDATA1 if needed)
	if len(redeemScript) < 76 {
		scriptSig = append(scriptSig, byte(len(redeemScript)))
	} else if len(redeemScript) < 256 {
		scriptSig = append(scriptSig, 0x4c) // OP_PUSHDATA1
		scriptSig = append(scriptSig, byte(len(redeemScript)))
	} else {
		scriptSig = append(scriptSig, 0x4d) // OP_PUSHDATA2
		scriptSig = append(scriptSig, byte(len(redeemScript)&0xff))
		scriptSig = append(scriptSig, byte((len(redeemScript)>>8)&0xff))
	}
	scriptSig = append(scriptSig, redeemScript...)

	return scriptSig
}

// computeHTLCSigHash computes the signature hash for a P2SH HTLC input
func computeHTLCSigHash(prevTxID []byte, prevVout uint32, redeemScript []byte, inputAmount, outputAmount int64, outputScript []byte) []byte {
	// Build the serialized transaction for signing
	// For legacy transactions, we use the traditional sighash computation

	var buf []byte

	// Version (4 bytes, little-endian)
	buf = append(buf, 0x01, 0x00, 0x00, 0x00)

	// Input count (varint)
	buf = append(buf, 0x01)

	// Previous output
	buf = append(buf, prevTxID...)
	buf = append(buf, byte(prevVout), byte(prevVout>>8), byte(prevVout>>16), byte(prevVout>>24))

	// ScriptSig (for signing, use the redeemScript)
	buf = append(buf, byte(len(redeemScript)))
	buf = append(buf, redeemScript...)

	// Sequence
	buf = append(buf, 0xff, 0xff, 0xff, 0xff)

	// Output count
	buf = append(buf, 0x01)

	// Output value (8 bytes, little-endian)
	buf = append(buf, byte(outputAmount), byte(outputAmount>>8), byte(outputAmount>>16), byte(outputAmount>>24))
	buf = append(buf, byte(outputAmount>>32), byte(outputAmount>>40), byte(outputAmount>>48), byte(outputAmount>>56))

	// Output script
	buf = append(buf, byte(len(outputScript)))
	buf = append(buf, outputScript...)

	// Locktime
	buf = append(buf, 0x00, 0x00, 0x00, 0x00)

	// SIGHASH_ALL
	buf = append(buf, 0x01, 0x00, 0x00, 0x00)

	// Double SHA256
	return Hash256(buf)
}

// buildRawTxWithScriptSig builds a raw transaction with the given scriptSig
func buildRawTxWithScriptSig(prevTxID []byte, prevVout uint32, scriptSig []byte, outputAmount int64, outputScript []byte) string {
	var buf []byte

	// Version (4 bytes)
	buf = append(buf, 0x01, 0x00, 0x00, 0x00)

	// Input count
	buf = append(buf, 0x01)

	// Previous output
	buf = append(buf, prevTxID...)
	buf = append(buf, byte(prevVout), byte(prevVout>>8), byte(prevVout>>16), byte(prevVout>>24))

	// ScriptSig with varint length
	if len(scriptSig) < 0xfd {
		buf = append(buf, byte(len(scriptSig)))
	} else {
		buf = append(buf, 0xfd)
		buf = append(buf, byte(len(scriptSig)&0xff), byte((len(scriptSig)>>8)&0xff))
	}
	buf = append(buf, scriptSig...)

	// Sequence
	buf = append(buf, 0xff, 0xff, 0xff, 0xff)

	// Output count
	buf = append(buf, 0x01)

	// Output value
	buf = append(buf, byte(outputAmount), byte(outputAmount>>8), byte(outputAmount>>16), byte(outputAmount>>24))
	buf = append(buf, byte(outputAmount>>32), byte(outputAmount>>40), byte(outputAmount>>48), byte(outputAmount>>56))

	// Output script
	buf = append(buf, byte(len(outputScript)))
	buf = append(buf, outputScript...)

	// Locktime
	buf = append(buf, 0x00, 0x00, 0x00, 0x00)

	return EncodeHex(buf)
}

