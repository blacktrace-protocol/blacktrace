package zcash

import (
	"crypto/sha256"
	"fmt"
	"math"
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
