package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var orderCmd = &cobra.Command{
	Use:   "order",
	Short: "Manage orders",
	Long:  `Create, list, and query orders on the BlackTrace network.`,
}

var orderCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new order",
	Long: `Create a new sell order for ZEC.

The order will be broadcast to all connected peers with:
  - Zero-knowledge commitment (hides exact amount)
  - Price range for negotiation
  - Stablecoin preference (USDC, USDT, DAI)`,
	Run: runOrderCreate,
}

var orderListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all orders",
	Long:  `List all orders discovered from connected peers.`,
	Run:   runOrderList,
}

var (
	amount      uint64
	stablecoin  string
	minPrice    uint64
	maxPrice    uint64
)

func init() {
	rootCmd.AddCommand(orderCmd)
	orderCmd.AddCommand(orderCreateCmd)
	orderCmd.AddCommand(orderListCmd)

	orderCreateCmd.Flags().Uint64VarP(&amount, "amount", "a", 0, "Amount of ZEC to sell (required)")
	orderCreateCmd.Flags().StringVarP(&stablecoin, "stablecoin", "s", "USDC", "Stablecoin type (USDC, USDT, DAI)")
	orderCreateCmd.Flags().Uint64Var(&minPrice, "min-price", 0, "Minimum price per ZEC (required)")
	orderCreateCmd.Flags().Uint64Var(&maxPrice, "max-price", 0, "Maximum price per ZEC (required)")

	orderCreateCmd.MarkFlagRequired("amount")
	orderCreateCmd.MarkFlagRequired("min-price")
	orderCreateCmd.MarkFlagRequired("max-price")
}

func runOrderCreate(cmd *cobra.Command, args []string) {
	fmt.Printf("📝 Creating order:\n")
	fmt.Printf("   Amount: %d ZEC\n", amount)
	fmt.Printf("   Stablecoin: %s\n", stablecoin)
	fmt.Printf("   Price Range: $%d - $%d per ZEC\n", minPrice, maxPrice)
	fmt.Printf("   Total Range: $%d - $%d %s\n\n", amount*minPrice, amount*maxPrice, stablecoin)

	// TODO: Implement actual order creation
	// app.CreateOrder(amount, stablecoin, minPrice, maxPrice)

	fmt.Printf("✅ Order created: order_[ID will be shown]\n")
	fmt.Printf("📤 Broadcasting to network...\n")
}

func runOrderList(cmd *cobra.Command, args []string) {
	fmt.Printf("🔍 Listing all orders:\n\n")

	// TODO: Implement actual order listing
	// orders := app.ListOrders()
	// for _, order := range orders {
	//     fmt.Printf("📋 Order ID: %s\n", order.OrderID)
	//     fmt.Printf("   Type: %s\n", order.OrderType)
	//     fmt.Printf("   Stablecoin: %s\n", order.Stablecoin)
	//     fmt.Printf("   Timestamp: %d\n\n", order.Timestamp)
	// }

	fmt.Printf("Found 0 orders (implementation pending)\n")
}
