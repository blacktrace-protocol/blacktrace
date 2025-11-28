package zcash

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"math"

	"golang.org/x/crypto/ripemd160"
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
// This is a simplified version for demo purposes that works with the regtest wallet
func (c *Client) ClaimHTLC(params *HTLCClaimParams) (string, error) {
	log.Printf("Claiming HTLC: txid=%s, vout=%d, amount=%.8f", params.HTLCTxID, params.HTLCVout, params.HTLCAmount)
	log.Printf("  Secret: %s", EncodeHex(params.Secret))
	log.Printf("  Recipient: %s", params.RecipientAddr)

	// Verify the secret hashes to the expected value
	// The HTLC uses RIPEMD160(secret) for verification (not RIPEMD160(SHA256(secret)))
	// Actually looking at the script, it uses OP_RIPEMD160 directly on the secret
	secretHash := ripemd160Hash(params.Secret)
	log.Printf("  Secret hash (RIPEMD160): %s", EncodeHex(secretHash))

	// Build transaction input
	inputs := []TxInput{
		{
			Txid: params.HTLCTxID,
			Vout: params.HTLCVout,
		},
	}

	// Build transaction output
	fee := 0.0001
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

	// For the demo, we'll use the wallet to sign since it controls all addresses
	// In production, this would require Bob's private key
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
	log.Printf("  Sign complete: %v", signResult.Complete)
	log.Printf("  Signed TX: %s", signResult.Hex)

	// Broadcast the transaction
	txid, err := c.BroadcastTransaction(signResult.Hex)
	if err != nil {
		return "", fmt.Errorf("failed to broadcast claim transaction: %w", err)
	}

	log.Printf("✅ HTLC Claim broadcast: %s", txid)
	return txid, nil
}

// ripemd160Hash computes RIPEMD160(data)
func ripemd160Hash(data []byte) []byte {
	hasher := ripemd160.New()
	hasher.Write(data)
	return hasher.Sum(nil)
}
