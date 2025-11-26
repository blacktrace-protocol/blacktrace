package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/spf13/cobra"
)

var queryCmd = &cobra.Command{
	Use:   "query",
	Short: "Query node information",
	Long:  `Query information about peers, orders, and node status.`,
}

var queryPeersCmd = &cobra.Command{
	Use:   "peers",
	Short: "List connected peers",
	Long:  `List all peers currently connected to this node.`,
	Run:   runQueryPeers,
}

var queryStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show node status",
	Long:  `Show the current status of this node.`,
	Run:   runQueryStatus,
}

func init() {
	rootCmd.AddCommand(queryCmd)
	queryCmd.AddCommand(queryPeersCmd)
	queryCmd.AddCommand(queryStatusCmd)
}

func runQueryPeers(cmd *cobra.Command, args []string) {
	fmt.Printf("📡 Connected Peers:\n\n")

	resp, err := http.Get(apiURL + "/peers")
	if err != nil {
		fmt.Printf("❌ Error connecting to node: %v\n", err)
		fmt.Printf("   Make sure a node is running (./blacktrace node)\n")
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Peers []struct {
			ID      string `json:"id"`
			Address string `json:"address"`
		} `json:"peers"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Printf("❌ Error parsing response: %v\n", err)
		return
	}

	if len(result.Peers) == 0 {
		fmt.Printf("No peers connected\n")
		return
	}

	for _, peer := range result.Peers {
		fmt.Printf("🔗 %s\n", peer.ID)
		fmt.Printf("   Address: %s\n\n", peer.Address)
	}

	fmt.Printf("Total: %d peers\n", len(result.Peers))
}

func runQueryStatus(cmd *cobra.Command, args []string) {
	fmt.Printf("📊 Node Status:\n\n")

	resp, err := http.Get(apiURL + "/status")
	if err != nil {
		fmt.Printf("❌ Error connecting to node: %v\n", err)
		fmt.Printf("   Make sure a node is running (./blacktrace node)\n")
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var status struct {
		PeerID     string `json:"peer_id"`
		ListenAddr string `json:"listen_addr"`
		PeerCount  int    `json:"peer_count"`
		OrderCount int    `json:"order_count"`
	}

	if err := json.Unmarshal(body, &status); err != nil {
		fmt.Printf("❌ Error parsing response: %v\n", err)
		return
	}

	fmt.Printf("Peer ID: %s\n", status.PeerID)
	fmt.Printf("Listening: %s\n", status.ListenAddr)
	fmt.Printf("Peers: %d\n", status.PeerCount)
	fmt.Printf("Orders: %d\n", status.OrderCount)
}
