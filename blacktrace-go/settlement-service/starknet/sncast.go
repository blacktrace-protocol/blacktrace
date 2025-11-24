package starknet

import (
	"context"
	"fmt"
	"math/big"
	"os/exec"
	"strings"

	"github.com/NethermindEth/juno/core/felt"
)

// SncastClient wraps the sncast CLI tool for invoking contract functions
type SncastClient struct {
	accountName     string
	accountsFile    string
	contractAddress string
	rpcURL          string
	sncastPath      string
}

// NewSncastClient creates a new sncast CLI wrapper
func NewSncastClient(rpcURL, contractAddress, accountName, accountsFile string) *SncastClient {
	return &SncastClient{
		accountName:     accountName,
		accountsFile:    accountsFile,
		contractAddress: contractAddress,
		rpcURL:          rpcURL,
		sncastPath:      "sncast", // Assumes sncast is in PATH
	}
}

// LockFunds locks STRK in the HTLC contract using sncast
func (s *SncastClient) LockFunds(ctx context.Context, hashLock *felt.Felt, receiver *felt.Felt, timeout uint64, amount *big.Int) (string, error) {
	// Split amount into low and high parts
	amountLow := new(big.Int).And(amount, new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 128), big.NewInt(1)))
	amountHigh := new(big.Int).Rsh(amount, 128)

	// Build calldata
	calldata := fmt.Sprintf("%s %s %d %s %s",
		hashLock.String(),
		receiver.String(),
		timeout,
		amountLow.String(),
		amountHigh.String(),
	)

	// Execute sncast invoke
	cmd := exec.CommandContext(ctx, s.sncastPath,
		"-a", s.accountName,
		"-f", s.accountsFile,
		"invoke",
		"--contract-address", s.contractAddress,
		"--function", "lock",
		"--calldata", calldata,
		"--url", s.rpcURL,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("sncast invoke failed: %w\nOutput: %s", err, string(output))
	}

	// Parse transaction hash from output
	// sncast outputs: "Transaction Hash: 0x..."
	outputStr := string(output)
	if strings.Contains(outputStr, "Transaction Hash:") {
		parts := strings.Split(outputStr, "Transaction Hash:")
		if len(parts) > 1 {
			txHash := strings.TrimSpace(strings.Split(parts[1], "\n")[0])
			return txHash, nil
		}
	}

	return "", fmt.Errorf("failed to parse transaction hash from output: %s", outputStr)
}

// ClaimFunds claims the locked STRK with the secret
func (s *SncastClient) ClaimFunds(ctx context.Context, secret *felt.Felt) (string, error) {
	// Build calldata
	calldata := secret.String()

	// Execute sncast invoke
	cmd := exec.CommandContext(ctx, s.sncastPath,
		"-a", s.accountName,
		"-f", s.accountsFile,
		"invoke",
		"--contract-address", s.contractAddress,
		"--function", "claim",
		"--calldata", calldata,
		"--url", s.rpcURL,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("sncast invoke failed: %w\nOutput: %s", err, string(output))
	}

	// Parse transaction hash from output
	outputStr := string(output)
	if strings.Contains(outputStr, "Transaction Hash:") {
		parts := strings.Split(outputStr, "Transaction Hash:")
		if len(parts) > 1 {
			txHash := strings.TrimSpace(strings.Split(parts[1], "\n")[0])
			return txHash, nil
		}
	}

	return "", fmt.Errorf("failed to parse transaction hash from output: %s", outputStr)
}

// RefundFunds refunds the locked STRK after timeout
func (s *SncastClient) RefundFunds(ctx context.Context) (string, error) {
	// Execute sncast invoke with no calldata
	cmd := exec.CommandContext(ctx, s.sncastPath,
		"-a", s.accountName,
		"-f", s.accountsFile,
		"invoke",
		"--contract-address", s.contractAddress,
		"--function", "refund",
		"--url", s.rpcURL,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("sncast invoke failed: %w\nOutput: %s", err, string(output))
	}

	// Parse transaction hash from output
	outputStr := string(output)
	if strings.Contains(outputStr, "Transaction Hash:") {
		parts := strings.Split(outputStr, "Transaction Hash:")
		if len(parts) > 1 {
			txHash := strings.TrimSpace(strings.Split(parts[1], "\n")[0])
			return txHash, nil
		}
	}

	return "", fmt.Errorf("failed to parse transaction hash from output: %s", outputStr)
}
