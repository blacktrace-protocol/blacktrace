package starknet

import (
	"context"
	"fmt"
	"math/big"

	"github.com/NethermindEth/juno/core/felt"
	"github.com/NethermindEth/starknet.go/account"
	"github.com/NethermindEth/starknet.go/rpc"
	"github.com/NethermindEth/starknet.go/utils"
)

// HTLCClient handles interactions with the Starknet HTLC contract
type HTLCClient struct {
	provider        *rpc.Provider
	account         *account.Account
	contractAddress *felt.Felt
}

// HTLCDetails represents the state of an HTLC
type HTLCDetails struct {
	HashLock  *felt.Felt
	Sender    *felt.Felt
	Receiver  *felt.Felt
	Amount    *big.Int
	Timeout   uint64
	Claimed   bool
	Refunded  bool
}

// NewHTLCClient creates a new Starknet HTLC client
func NewHTLCClient(rpcURL, contractAddress, accountAddress, privateKey string) (*HTLCClient, error) {
	ctx := context.Background()
	provider, err := rpc.NewProvider(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to create provider: %w", err)
	}

	// Parse contract address
	contractAddr, err := utils.HexToFelt(contractAddress)
	if err != nil {
		return nil, fmt.Errorf("invalid contract address: %w", err)
	}

	// Parse account address
	accountAddr, err := utils.HexToFelt(accountAddress)
	if err != nil {
		return nil, fmt.Errorf("invalid account address: %w", err)
	}

	// Parse private key
	privKey, err := utils.HexToFelt(privateKey)
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %w", err)
	}

	// Create account
	ks := account.NewMemKeystore()
	fakePrivKeyBI, ok := new(big.Int).SetString(privKey.String(), 0)
	if !ok {
		return nil, fmt.Errorf("invalid private key format")
	}
	ks.Put(accountAddr.String(), fakePrivKeyBI)

	acc, err := account.NewAccount(provider, accountAddr, accountAddr.String(), ks, 2)
	if err != nil {
		return nil, fmt.Errorf("failed to create account: %w", err)
	}

	return &HTLCClient{
		provider:        provider,
		account:         acc,
		contractAddress: contractAddr,
	}, nil
}

// GetHTLCDetails retrieves the current state of the HTLC
func (c *HTLCClient) GetHTLCDetails(ctx context.Context) (*HTLCDetails, error) {
	// Call the view function
	tx := rpc.FunctionCall{
		ContractAddress:    c.contractAddress,
		EntryPointSelector: utils.GetSelectorFromNameFelt("get_htlc_details"),
		Calldata:           []*felt.Felt{},
	}

	result, err := c.provider.Call(ctx, tx, rpc.BlockID{Tag: "latest"})
	if err != nil {
		return nil, fmt.Errorf("failed to call get_htlc_details: %w", err)
	}

	if len(result) < 8 {
		return nil, fmt.Errorf("invalid response from contract: expected 8 fields, got %d", len(result))
	}

	// Parse the result
	// Result format: [hash_lock, sender, receiver, amount_low, amount_high, timeout, claimed, refunded]
	hashLock := result[0]
	sender := result[1]
	receiver := result[2]

	// Reconstruct u256 amount from low and high parts
	amount := new(big.Int).Or(
		result[3].BigInt(new(big.Int)),
		new(big.Int).Lsh(result[4].BigInt(new(big.Int)), 128),
	)

	timeout := result[5].BigInt(new(big.Int)).Uint64()
	claimed := result[6].BigInt(new(big.Int)).Cmp(big.NewInt(0)) != 0
	refunded := result[7].BigInt(new(big.Int)).Cmp(big.NewInt(0)) != 0

	return &HTLCDetails{
		HashLock:  hashLock,
		Sender:    sender,
		Receiver:  receiver,
		Amount:    amount,
		Timeout:   timeout,
		Claimed:   claimed,
		Refunded:  refunded,
	}, nil
}

// Lock locks STRK tokens in the HTLC contract
// TODO: Implement using sncast command-line tool or updated starknet.go API
func (c *HTLCClient) Lock(ctx context.Context, hashLock *felt.Felt, receiver *felt.Felt, timeout uint64, amount *big.Int) (string, error) {
	return "", fmt.Errorf("Lock function not yet implemented - use sncast CLI for now")
}

// Claim claims the locked STRK with the secret
// TODO: Implement using sncast command-line tool or updated starknet.go API
func (c *HTLCClient) Claim(ctx context.Context, secret *felt.Felt) (string, error) {
	return "", fmt.Errorf("Claim function not yet implemented - use sncast CLI for now")
}

// Refund refunds the locked STRK back to the sender after timeout
// TODO: Implement using sncast command-line tool or updated starknet.go API
func (c *HTLCClient) Refund(ctx context.Context) (string, error) {
	return "", fmt.Errorf("Refund function not yet implemented - use sncast CLI for now")
}

// HexToFelt converts a hex string to a felt
func HexToFelt(hexStr string) (*felt.Felt, error) {
	return utils.HexToFelt(hexStr)
}

// ComputePedersenHash computes the Pedersen hash of a secret
// TODO: Implement actual Pedersen hash using starknet-crypto
func ComputePedersenHash(secret *felt.Felt) (*felt.Felt, error) {
	return nil, fmt.Errorf("Pedersen hash computation not yet implemented")
}
