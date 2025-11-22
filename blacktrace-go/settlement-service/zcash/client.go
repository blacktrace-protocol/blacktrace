package zcash

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Client represents a Zcash RPC client
type Client struct {
	url      string
	user     string
	password string
	client   *http.Client
}

// RPCRequest represents a JSON-RPC request
type RPCRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      string        `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
}

// RPCResponse represents a JSON-RPC response
type RPCResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *RPCError       `json:"error"`
	ID     string          `json:"id"`
}

// RPCError represents a JSON-RPC error
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// NewClient creates a new Zcash RPC client
func NewClient(url, user, password string) *Client {
	return &Client{
		url:      url,
		user:     user,
		password: password,
		client:   &http.Client{},
	}
}

// call makes a JSON-RPC call to the Zcash node
func (c *Client) call(method string, params ...interface{}) (json.RawMessage, error) {
	// Build request
	req := RPCRequest{
		JSONRPC: "1.0",
		ID:      "blacktrace",
		Method:  method,
		Params:  params,
	}

	// Marshal to JSON
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	httpReq, err := http.NewRequest("POST", c.url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.SetBasicAuth(c.user, c.password)

	// Make request
	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Parse response
	var rpcResp RPCResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	// Check for RPC error
	if rpcResp.Error != nil {
		return nil, fmt.Errorf("RPC error: %s (code %d)", rpcResp.Error.Message, rpcResp.Error.Code)
	}

	return rpcResp.Result, nil
}

// GetBlockCount returns the current block height
func (c *Client) GetBlockCount() (int64, error) {
	result, err := c.call("getblockcount")
	if err != nil {
		return 0, err
	}

	var count int64
	if err := json.Unmarshal(result, &count); err != nil {
		return 0, fmt.Errorf("failed to unmarshal block count: %w", err)
	}

	return count, nil
}

// Generate mines blocks instantly (regtest only)
func (c *Client) Generate(numBlocks int) ([]string, error) {
	result, err := c.call("generate", numBlocks)
	if err != nil {
		return nil, err
	}

	var blockHashes []string
	if err := json.Unmarshal(result, &blockHashes); err != nil {
		return nil, fmt.Errorf("failed to unmarshal block hashes: %w", err)
	}

	return blockHashes, nil
}

// GetNewAddress creates a new Zcash address
func (c *Client) GetNewAddress() (string, error) {
	result, err := c.call("getnewaddress")
	if err != nil {
		return "", err
	}

	var address string
	if err := json.Unmarshal(result, &address); err != nil {
		return "", fmt.Errorf("failed to unmarshal address: %w", err)
	}

	return address, nil
}

// GetBalance returns the wallet balance
func (c *Client) GetBalance() (float64, error) {
	result, err := c.call("getbalance")
	if err != nil {
		return 0, err
	}

	var balance float64
	if err := json.Unmarshal(result, &balance); err != nil {
		return 0, fmt.Errorf("failed to unmarshal balance: %w", err)
	}

	return balance, nil
}

// SendToAddress sends ZEC to an address
func (c *Client) SendToAddress(address string, amount float64) (string, error) {
	result, err := c.call("sendtoaddress", address, amount)
	if err != nil {
		return "", err
	}

	var txid string
	if err := json.Unmarshal(result, &txid); err != nil {
		return "", fmt.Errorf("failed to unmarshal txid: %w", err)
	}

	return txid, nil
}

// TxInput represents a transaction input
type TxInput struct {
	Txid string `json:"txid"`
	Vout uint32 `json:"vout"`
}

// TxOutput represents a transaction output (map of address to amount)
type TxOutput map[string]float64

// CreateRawTransaction creates a raw transaction
func (c *Client) CreateRawTransaction(inputs []TxInput, outputs TxOutput) (string, error) {
	result, err := c.call("createrawtransaction", inputs, outputs)
	if err != nil {
		return "", err
	}

	var rawTx string
	if err := json.Unmarshal(result, &rawTx); err != nil {
		return "", fmt.Errorf("failed to unmarshal raw transaction: %w", err)
	}

	return rawTx, nil
}

// SignRawTransactionResult represents the result of signing a raw transaction
type SignRawTransactionResult struct {
	Hex      string `json:"hex"`
	Complete bool   `json:"complete"`
}

// SignRawTransaction signs a raw transaction
func (c *Client) SignRawTransaction(rawTx string) (*SignRawTransactionResult, error) {
	result, err := c.call("signrawtransaction", rawTx)
	if err != nil {
		return nil, err
	}

	var signResult SignRawTransactionResult
	if err := json.Unmarshal(result, &signResult); err != nil {
		return nil, fmt.Errorf("failed to unmarshal sign result: %w", err)
	}

	return &signResult, nil
}

// SendRawTransaction broadcasts a signed raw transaction
func (c *Client) SendRawTransaction(signedTx string) (string, error) {
	result, err := c.call("sendrawtransaction", signedTx)
	if err != nil {
		return "", err
	}

	var txid string
	if err := json.Unmarshal(result, &txid); err != nil {
		return "", fmt.Errorf("failed to unmarshal txid: %w", err)
	}

	return txid, nil
}

// GetTransaction retrieves transaction details
func (c *Client) GetTransaction(txid string) (map[string]interface{}, error) {
	result, err := c.call("gettransaction", txid)
	if err != nil {
		return nil, err
	}

	var tx map[string]interface{}
	if err := json.Unmarshal(result, &tx); err != nil {
		return nil, fmt.Errorf("failed to unmarshal transaction: %w", err)
	}

	return tx, nil
}

// DecodeRawTransaction decodes a raw transaction hex
func (c *Client) DecodeRawTransaction(rawTx string) (map[string]interface{}, error) {
	result, err := c.call("decoderawtransaction", rawTx)
	if err != nil {
		return nil, err
	}

	var tx map[string]interface{}
	if err := json.Unmarshal(result, &tx); err != nil {
		return nil, fmt.Errorf("failed to unmarshal decoded transaction: %w", err)
	}

	return tx, nil
}

// ListUnspent lists unspent transaction outputs
type UTXO struct {
	Txid          string  `json:"txid"`
	Vout          uint32  `json:"vout"`
	Address       string  `json:"address"`
	ScriptPubKey  string  `json:"scriptPubKey"`
	Amount        float64 `json:"amount"`
	Confirmations int64   `json:"confirmations"`
	Spendable     bool    `json:"spendable"`
}

// ListUnspent returns unspent transaction outputs
func (c *Client) ListUnspent(minConf, maxConf int) ([]UTXO, error) {
	result, err := c.call("listunspent", minConf, maxConf)
	if err != nil {
		return nil, err
	}

	var utxos []UTXO
	if err := json.Unmarshal(result, &utxos); err != nil {
		return nil, fmt.Errorf("failed to unmarshal UTXOs: %w", err)
	}

	return utxos, nil
}

// GetInfo returns general info about the node
func (c *Client) GetInfo() (map[string]interface{}, error) {
	result, err := c.call("getinfo")
	if err != nil {
		return nil, err
	}

	var info map[string]interface{}
	if err := json.Unmarshal(result, &info); err != nil {
		return nil, fmt.Errorf("failed to unmarshal info: %w", err)
	}

	return info, nil
}
