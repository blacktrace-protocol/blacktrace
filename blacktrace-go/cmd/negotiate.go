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

var negotiateListProposalsCmd = &cobra.Command{
	Use:   "list-proposals <order-id>",
	Short: "List all proposals for an order",
	Long:  `List all proposals (from both maker and takers) for a specific order.`,
	Args:  cobra.ExactArgs(1),
	Run:   runNegotiateListProposals,
}

var negotiateAcceptCmd = &cobra.Command{
	Use:   "accept",
	Short: "Accept a proposal",
	Long:  `Accept a specific proposal to proceed with settlement.`,
	Run:   runNegotiateAccept,
}

var (
	proposePrice  uint64
	proposeAmount uint64
	proposalID    string
)

func init() {
	rootCmd.AddCommand(negotiateCmd)
	negotiateCmd.AddCommand(negotiateRequestCmd)
	negotiateCmd.AddCommand(negotiateProposeCmd)
	negotiateCmd.AddCommand(negotiateListProposalsCmd)
	negotiateCmd.AddCommand(negotiateAcceptCmd)

	negotiateProposeCmd.Flags().Uint64VarP(&proposePrice, "price", "p", 0, "Price per ZEC (required)")
	negotiateProposeCmd.Flags().Uint64VarP(&proposeAmount, "amount", "a", 0, "Amount of ZEC (required)")
	negotiateProposeCmd.MarkFlagRequired("price")
	negotiateProposeCmd.MarkFlagRequired("amount")

	negotiateAcceptCmd.Flags().StringVar(&proposalID, "proposal-id", "", "Proposal ID to accept (required)")
	negotiateAcceptCmd.MarkFlagRequired("proposal-id")
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
	// Load session token
	sessionID, _, err := loadSessionLocal()
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		fmt.Printf("   Please login first: ./blacktrace auth login\n")
		return
	}

	orderID := args[0]
	fmt.Printf("💰 Proposing for order: %s\n", orderID)
	fmt.Printf("   Price: $%d per ZEC\n", proposePrice)
	fmt.Printf("   Amount: %d ZEC\n", proposeAmount)
	fmt.Printf("   Total: $%d\n\n", proposePrice*proposeAmount)

	reqBody := map[string]interface{}{
		"session_id": sessionID,
		"order_id":   orderID,
		"price":      proposePrice,
		"amount":     proposeAmount,
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
		if resp.StatusCode == http.StatusUnauthorized {
			fmt.Printf("   Your session may have expired. Please login again.\n")
		}
		return
	}

	fmt.Printf("✅ Proposal sent\n")
}

func runNegotiateListProposals(cmd *cobra.Command, args []string) {
	orderID := args[0]
	fmt.Printf("📋 Listing proposals for order: %s\n\n", orderID)

	reqBody := map[string]string{
		"order_id": orderID,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		return
	}

	resp, err := http.Post(apiURL+"/negotiate/proposals", "application/json", bytes.NewBuffer(jsonData))
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

	var result struct {
		Proposals []struct {
			ProposalID string `json:"proposal_id"`
			OrderID    string `json:"order_id"`
			Price      uint64 `json:"price"`
			Amount     uint64 `json:"amount"`
			ProposerID string `json:"proposer_id"`
			Status     string `json:"status"`
			Timestamp  string `json:"timestamp"`
		} `json:"proposals"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Printf("❌ Error parsing response: %v\n", err)
		return
	}

	if len(result.Proposals) == 0 {
		fmt.Printf("No proposals found for this order\n")
		return
	}

	for i, proposal := range result.Proposals {
		fmt.Printf("📝 Proposal #%d:\n", i+1)
		fmt.Printf("   Proposal ID: %s\n", proposal.ProposalID)
		fmt.Printf("   Price: $%d per ZEC\n", proposal.Price)
		fmt.Printf("   Amount: %d ZEC\n", proposal.Amount)
		fmt.Printf("   Total: $%d\n", proposal.Price*proposal.Amount)
		fmt.Printf("   Proposer: %s\n", proposal.ProposerID)
		fmt.Printf("   Status: %s\n", proposal.Status)
		fmt.Printf("   Timestamp: %s\n", proposal.Timestamp)
		fmt.Printf("\n")
	}

	fmt.Printf("Total: %d proposals\n", len(result.Proposals))
}

func runNegotiateAccept(cmd *cobra.Command, args []string) {
	fmt.Printf("✅ Accepting proposal: %s\n", proposalID)

	reqBody := map[string]string{
		"proposal_id": proposalID,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		fmt.Printf("❌ Error: %v\n", err)
		return
	}

	resp, err := http.Post(apiURL+"/negotiate/accept", "application/json", bytes.NewBuffer(jsonData))
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

	fmt.Printf("✅ Proposal accepted successfully!\n")
	fmt.Printf("🔒 Ready to proceed with settlement\n")
}
