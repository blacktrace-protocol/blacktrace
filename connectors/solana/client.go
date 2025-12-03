// Package solana provides a client for interacting with Solana RPC
// and the BlackTrace HTLC program.
package solana

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client is a Solana RPC client
type Client struct {
	rpcURL     string
	httpClient *http.Client
	programID  string
}

// NewClient creates a new Solana RPC client
func NewClient(rpcURL, programID string) *Client {
	return &Client{
		rpcURL: rpcURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		programID: programID,
	}
}

// RPCRequest represents a JSON-RPC request
type RPCRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      int           `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params,omitempty"`
}

// RPCResponse represents a JSON-RPC response
type RPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

// RPCError represents a JSON-RPC error
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// call makes a JSON-RPC call to the Solana node
func (c *Client) call(method string, params ...interface{}) (json.RawMessage, error) {
	req := RPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(c.rpcURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var rpcResp RPCResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("RPC error: %s (code %d)", rpcResp.Error.Message, rpcResp.Error.Code)
	}

	return rpcResp.Result, nil
}

// GetHealth checks if the Solana node is healthy
func (c *Client) GetHealth() error {
	_, err := c.call("getHealth")
	return err
}

// GetVersion returns the Solana node version
func (c *Client) GetVersion() (string, error) {
	result, err := c.call("getVersion")
	if err != nil {
		return "", err
	}

	var version struct {
		SolanaCore string `json:"solana-core"`
	}
	if err := json.Unmarshal(result, &version); err != nil {
		return "", fmt.Errorf("failed to unmarshal version: %w", err)
	}

	return version.SolanaCore, nil
}

// GetSlot returns the current slot
func (c *Client) GetSlot() (uint64, error) {
	result, err := c.call("getSlot")
	if err != nil {
		return 0, err
	}

	var slot uint64
	if err := json.Unmarshal(result, &slot); err != nil {
		return 0, fmt.Errorf("failed to unmarshal slot: %w", err)
	}

	return slot, nil
}

// GetBalance returns the SOL balance for an address (in lamports)
func (c *Client) GetBalance(address string) (uint64, error) {
	result, err := c.call("getBalance", address)
	if err != nil {
		return 0, err
	}

	var balanceResp struct {
		Value uint64 `json:"value"`
	}
	if err := json.Unmarshal(result, &balanceResp); err != nil {
		return 0, fmt.Errorf("failed to unmarshal balance: %w", err)
	}

	return balanceResp.Value, nil
}

// GetTokenAccountBalance returns the SPL token balance for a token account
func (c *Client) GetTokenAccountBalance(tokenAccount string) (uint64, error) {
	result, err := c.call("getTokenAccountBalance", tokenAccount)
	if err != nil {
		return 0, err
	}

	var balanceResp struct {
		Value struct {
			Amount string `json:"amount"`
		} `json:"value"`
	}
	if err := json.Unmarshal(result, &balanceResp); err != nil {
		return 0, fmt.Errorf("failed to unmarshal token balance: %w", err)
	}

	var amount uint64
	fmt.Sscanf(balanceResp.Value.Amount, "%d", &amount)
	return amount, nil
}

// RequestAirdrop requests an airdrop of SOL (devnet/testnet only)
func (c *Client) RequestAirdrop(address string, lamports uint64) (string, error) {
	result, err := c.call("requestAirdrop", address, lamports)
	if err != nil {
		return "", err
	}

	var signature string
	if err := json.Unmarshal(result, &signature); err != nil {
		return "", fmt.Errorf("failed to unmarshal signature: %w", err)
	}

	return signature, nil
}

// GetTransaction returns transaction details
func (c *Client) GetTransaction(signature string) (map[string]interface{}, error) {
	result, err := c.call("getTransaction", signature, map[string]string{
		"encoding": "json",
	})
	if err != nil {
		return nil, err
	}

	var tx map[string]interface{}
	if err := json.Unmarshal(result, &tx); err != nil {
		return nil, fmt.Errorf("failed to unmarshal transaction: %w", err)
	}

	return tx, nil
}

// SendTransaction sends a signed transaction
func (c *Client) SendTransaction(signedTx string) (string, error) {
	result, err := c.call("sendTransaction", signedTx, map[string]interface{}{
		"encoding":            "base64",
		"skipPreflight":       false,
		"preflightCommitment": "confirmed",
	})
	if err != nil {
		return "", err
	}

	var signature string
	if err := json.Unmarshal(result, &signature); err != nil {
		return "", fmt.Errorf("failed to unmarshal signature: %w", err)
	}

	return signature, nil
}

// ConfirmTransaction waits for a transaction to be confirmed
func (c *Client) ConfirmTransaction(signature string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		result, err := c.call("getSignatureStatuses", []string{signature})
		if err != nil {
			return err
		}

		var statuses struct {
			Value []struct {
				ConfirmationStatus string `json:"confirmationStatus"`
				Err                interface{} `json:"err"`
			} `json:"value"`
		}
		if err := json.Unmarshal(result, &statuses); err != nil {
			return fmt.Errorf("failed to unmarshal status: %w", err)
		}

		if len(statuses.Value) > 0 && statuses.Value[0].ConfirmationStatus != "" {
			if statuses.Value[0].Err != nil {
				return fmt.Errorf("transaction failed: %v", statuses.Value[0].Err)
			}
			if statuses.Value[0].ConfirmationStatus == "confirmed" ||
				statuses.Value[0].ConfirmationStatus == "finalized" {
				return nil
			}
		}

		time.Sleep(500 * time.Millisecond)
	}

	return fmt.Errorf("transaction confirmation timeout")
}

// GetAccountInfo returns account information
func (c *Client) GetAccountInfo(address string) (map[string]interface{}, error) {
	result, err := c.call("getAccountInfo", address, map[string]string{
		"encoding": "base64",
	})
	if err != nil {
		return nil, err
	}

	var account map[string]interface{}
	if err := json.Unmarshal(result, &account); err != nil {
		return nil, fmt.Errorf("failed to unmarshal account: %w", err)
	}

	return account, nil
}

// HTLCDetails represents the state of an HTLC
type HTLCDetails struct {
	HashLock  [32]byte `json:"hash_lock"`
	Sender    string   `json:"sender"`
	Receiver  string   `json:"receiver"`
	TokenMint string   `json:"token_mint"`
	Amount    uint64   `json:"amount"`
	Timeout   int64    `json:"timeout"`
	Claimed   bool     `json:"claimed"`
	Refunded  bool     `json:"refunded"`
}

// ComputeHashLock computes SHA256 hash of a secret (for HTLC compatibility with Zcash)
func ComputeHashLock(secret []byte) [32]byte {
	return sha256.Sum256(secret)
}

// ComputeHTLCPDA computes the PDA address for an HTLC account
func (c *Client) ComputeHTLCPDA(hashLock [32]byte) (string, uint8, error) {
	// This would normally use the Solana SDK to compute the PDA
	// For now, we'll need to compute this client-side in the frontend
	// or use a helper endpoint
	return "", 0, fmt.Errorf("PDA computation requires Solana SDK - use frontend")
}

// GetHTLCDetails fetches HTLC details from the program
func (c *Client) GetHTLCDetails(htlcAddress string) (*HTLCDetails, error) {
	accountInfo, err := c.GetAccountInfo(htlcAddress)
	if err != nil {
		return nil, err
	}

	value, ok := accountInfo["value"].(map[string]interface{})
	if !ok || value == nil {
		return nil, fmt.Errorf("HTLC account not found")
	}

	data, ok := value["data"].([]interface{})
	if !ok || len(data) < 1 {
		return nil, fmt.Errorf("invalid account data")
	}

	// Decode base64 account data
	encodedData, ok := data[0].(string)
	if !ok {
		return nil, fmt.Errorf("invalid encoded data")
	}

	accountData, err := base64.StdEncoding.DecodeString(encodedData)
	if err != nil {
		return nil, fmt.Errorf("failed to decode account data: %w", err)
	}

	// Parse HTLC account data (skip 8-byte discriminator)
	if len(accountData) < 155 {
		return nil, fmt.Errorf("account data too short")
	}

	htlc := &HTLCDetails{}
	offset := 8 // Skip discriminator

	// hash_lock: [u8; 32]
	copy(htlc.HashLock[:], accountData[offset:offset+32])
	offset += 32

	// sender: Pubkey (32 bytes)
	htlc.Sender = base64.StdEncoding.EncodeToString(accountData[offset : offset+32])
	offset += 32

	// receiver: Pubkey (32 bytes)
	htlc.Receiver = base64.StdEncoding.EncodeToString(accountData[offset : offset+32])
	offset += 32

	// token_mint: Pubkey (32 bytes)
	htlc.TokenMint = base64.StdEncoding.EncodeToString(accountData[offset : offset+32])
	offset += 32

	// amount: u64 (8 bytes, little endian)
	htlc.Amount = uint64(accountData[offset]) |
		uint64(accountData[offset+1])<<8 |
		uint64(accountData[offset+2])<<16 |
		uint64(accountData[offset+3])<<24 |
		uint64(accountData[offset+4])<<32 |
		uint64(accountData[offset+5])<<40 |
		uint64(accountData[offset+6])<<48 |
		uint64(accountData[offset+7])<<56
	offset += 8

	// timeout: i64 (8 bytes, little endian)
	htlc.Timeout = int64(accountData[offset]) |
		int64(accountData[offset+1])<<8 |
		int64(accountData[offset+2])<<16 |
		int64(accountData[offset+3])<<24 |
		int64(accountData[offset+4])<<32 |
		int64(accountData[offset+5])<<40 |
		int64(accountData[offset+6])<<48 |
		int64(accountData[offset+7])<<56
	offset += 8

	// claimed: bool
	htlc.Claimed = accountData[offset] != 0
	offset++

	// refunded: bool
	htlc.Refunded = accountData[offset] != 0

	return htlc, nil
}
