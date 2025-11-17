package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// Default API URL for connecting to running node
const apiURL = "http://localhost:8080"

var rootCmd = &cobra.Command{
	Use:   "blacktrace",
	Short: "BlackTrace - Zero-Knowledge OTC Protocol for Institutional Zcash Trading",
	Long: `BlackTrace enables institutions to execute large-volume ZEC trades without
market impact, information leakage, or counterparty risk.

Features:
  - Zero-knowledge liquidity proofs
  - Encrypted P2P negotiation via libp2p
  - Atomic settlement with two-layer HTLCs (Zcash L1 + Ztarknet L2)`,
}

// Execute runs the root command
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	// Global flags can be added here
}
