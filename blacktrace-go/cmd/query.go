package cmd

import (
	"fmt"

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

	// TODO: Implement actual peer query
	// peers := app.network.GetPeers()
	// for _, peer := range peers {
	//     fmt.Printf("🔗 %s\n", peer.ID)
	//     fmt.Printf("   Address: %s\n\n", peer.Addr)
	// }

	fmt.Printf("No peers connected (implementation pending)\n")
}

func runQueryStatus(cmd *cobra.Command, args []string) {
	fmt.Printf("📊 Node Status:\n\n")

	// TODO: Implement actual status query
	// status := app.GetStatus()
	// fmt.Printf("Peer ID: %s\n", status.PeerID)
	// fmt.Printf("Listening: %s\n", status.ListenAddr)
	// fmt.Printf("Peers: %d\n", status.PeerCount)
	// fmt.Printf("Orders: %d\n", status.OrderCount)

	fmt.Printf("Status: Running (implementation pending)\n")
}
