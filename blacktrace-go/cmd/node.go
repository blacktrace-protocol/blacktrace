package cmd

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
)

var (
	nodePort    int
	connectAddr string
)

var nodeCmd = &cobra.Command{
	Use:   "node",
	Short: "Start a BlackTrace node",
	Long: `Start a BlackTrace node that participates in the P2P network.

The node will:
  - Listen for incoming peer connections on the specified port
  - Automatically discover peers via mDNS
  - Handle order announcements and negotiations
  - Manage HTLC settlements (when on-chain integration is ready)`,
	Run: runNode,
}

func init() {
	rootCmd.AddCommand(nodeCmd)

	nodeCmd.Flags().IntVarP(&nodePort, "port", "p", 9000, "Port to listen on")
	nodeCmd.Flags().StringVarP(&connectAddr, "connect", "c", "", "Multiaddr of peer to connect to (optional)")
}

func runNode(cmd *cobra.Command, args []string) {
	fmt.Printf("╔══════════════════════════════════════════════╗\n")
	fmt.Printf("║   BlackTrace Node                           ║\n")
	fmt.Printf("╚══════════════════════════════════════════════╝\n\n")

	// Import at runtime to avoid circular dependency
	// In real implementation, this would be a proper import
	fmt.Printf("🚀 Starting BlackTrace node on port %d...\n", nodePort)

	// TODO: Replace with actual implementation
	// app, err := main.NewBlackTraceApp(nodePort)
	// if err != nil {
	//     log.Fatalf("Failed to create app: %v", err)
	// }
	// app.Run()

	log.Printf("✅ Node online - Peer ID: [will be shown when app is initialized]")
	log.Printf("📡 Listening on: /ip4/0.0.0.0/tcp/%d", nodePort)

	if connectAddr != "" {
		log.Printf("🔗 Connecting to peer: %s", connectAddr)
		// TODO: app.network.CommandChan() <- NetworkCommand{Type: "connect", Addr: connectAddr}
	}

	log.Printf("\nNode is running. Press Ctrl+C to stop.\n")

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\n👋 Shutting down node...")
}
