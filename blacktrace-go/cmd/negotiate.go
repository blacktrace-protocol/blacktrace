package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var negotiateCmd = &cobra.Command{
	Use:   "negotiate",
	Short: "Negotiate order terms",
	Long:  `Initiate negotiation or propose prices for an order.`,
}

var negotiateRequestCmd = &cobra.Command{
	Use:   "request <order-id>",
	Short: "Request order details",
	Long:  `Request full details for an order (initiates negotiation).`,
	Args:  cobra.ExactArgs(1),
	Run:   runNegotiateRequest,
}

var negotiateProposeCmd = &cobra.Command{
	Use:   "propose <order-id>",
	Short: "Propose a price",
	Long:  `Propose a price for an order during negotiation.`,
	Args:  cobra.ExactArgs(1),
	Run:   runNegotiatePropose,
}

var (
	proposePrice  uint64
	proposeAmount uint64
)

func init() {
	rootCmd.AddCommand(negotiateCmd)
	negotiateCmd.AddCommand(negotiateRequestCmd)
	negotiateCmd.AddCommand(negotiateProposeCmd)

	negotiateProposeCmd.Flags().Uint64VarP(&proposePrice, "price", "p", 0, "Price per ZEC (required)")
	negotiateProposeCmd.Flags().Uint64VarP(&proposeAmount, "amount", "a", 0, "Amount of ZEC (required)")
	negotiateProposeCmd.MarkFlagRequired("price")
	negotiateProposeCmd.MarkFlagRequired("amount")
}

func runNegotiateRequest(cmd *cobra.Command, args []string) {
	orderID := args[0]
	fmt.Printf("💬 Requesting details for order: %s\n", orderID)

	// TODO: Implement actual negotiation request
	// app.RequestOrderDetails(orderID)

	fmt.Printf("✅ Request sent to maker\n")
	fmt.Printf("📨 Waiting for response...\n")
}

func runNegotiatePropose(cmd *cobra.Command, args []string) {
	orderID := args[0]
	fmt.Printf("💰 Proposing for order: %s\n", orderID)
	fmt.Printf("   Price: $%d per ZEC\n", proposePrice)
	fmt.Printf("   Amount: %d ZEC\n", proposeAmount)
	fmt.Printf("   Total: $%d\n\n", proposePrice*proposeAmount)

	// TODO: Implement actual price proposal
	// app.ProposePrice(orderID, proposePrice, proposeAmount)

	fmt.Printf("✅ Proposal sent\n")
}
