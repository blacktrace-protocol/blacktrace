package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

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
	// Load session token
	sessionID, _, err := loadSessionLocal()
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		fmt.Printf("   Please login first: ./blacktrace auth login\n")
		return
	}

	fmt.Printf("📝 Creating order:\n")
	fmt.Printf("   Amount: %d ZEC\n", amount)
	fmt.Printf("   Stablecoin: %s\n", stablecoin)
	fmt.Printf("   Price Range: $%d - $%d per ZEC\n", minPrice, maxPrice)
	fmt.Printf("   Total Range: $%d - $%d %s\n\n", amount*minPrice, amount*maxPrice, stablecoin)

	// Create request body with session ID
	reqBody := map[string]interface{}{
		"session_id": sessionID,
		"amount":     amount,
		"stablecoin": stablecoin,
		"min_price":  minPrice,
		"max_price":  maxPrice,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		return
	}

	// Send HTTP request to node's API
	resp, err := http.Post(apiURL+"/orders/create", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Printf("❌ Error connecting to node: %v\n", err)
		fmt.Printf("   Make sure a node is running (./blacktrace node)\n")
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]string
		json.Unmarshal(body, &errResp)
		fmt.Printf("❌ Error: %s\n", errResp["error"])
		if resp.StatusCode == http.StatusUnauthorized {
			fmt.Printf("   Your session may have expired. Please login again.\n")
		}
		return
	}

	var result map[string]string
	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Printf("❌ Error parsing response: %v\n", err)
		return
	}

	fmt.Printf("✅ Order created: %s\n", result["order_id"])
	fmt.Printf("📤 Broadcasting to network...\n")
}

func runOrderList(cmd *cobra.Command, args []string) {
	fmt.Printf("🔍 Listing all orders:\n\n")

	// Send HTTP request to node's API
	resp, err := http.Get(apiURL + "/orders")
	if err != nil {
		fmt.Printf("❌ Error connecting to node: %v\n", err)
		fmt.Printf("   Make sure a node is running (./blacktrace node)\n")
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Orders []map[string]interface{} `json:"orders"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Printf("❌ Error parsing response: %v\n", err)
		return
	}

	if len(result.Orders) == 0 {
		fmt.Printf("Found 0 orders\n")
		return
	}

	for _, order := range result.Orders {
		fmt.Printf("📋 Order ID: %v\n", order["order_id"])
		fmt.Printf("   Type: %v\n", order["order_type"])
		fmt.Printf("   Stablecoin: %v\n", order["stablecoin"])
		fmt.Printf("   Timestamp: %v\n\n", order["timestamp"])
	}

	fmt.Printf("Total: %d orders\n", len(result.Orders))
}
