package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

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

	reqBody := map[string]string{
		"order_id": orderID,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		return
	}

	resp, err := http.Post(apiURL+"/negotiate/request", "application/json", bytes.NewBuffer(jsonData))
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
		return
	}

	fmt.Printf("✅ Request sent to maker\n")
	fmt.Printf("📨 Waiting for response...\n")
}

func runNegotiatePropose(cmd *cobra.Command, args []string) {
	orderID := args[0]
	fmt.Printf("💰 Proposing for order: %s\n", orderID)
	fmt.Printf("   Price: $%d per ZEC\n", proposePrice)
	fmt.Printf("   Amount: %d ZEC\n", proposeAmount)
	fmt.Printf("   Total: $%d\n\n", proposePrice*proposeAmount)

	reqBody := map[string]interface{}{
		"order_id": orderID,
		"price":    proposePrice,
		"amount":   proposeAmount,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		return
	}

	resp, err := http.Post(apiURL+"/negotiate/propose", "application/json", bytes.NewBuffer(jsonData))
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
		return
	}

	fmt.Printf("✅ Proposal sent\n")
}
