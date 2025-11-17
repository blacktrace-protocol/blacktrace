package cmd

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/blacktrace/blacktrace/node"
	"github.com/spf13/cobra"
)

var (
	nodePort int
	apiPort  int
	connectAddr string
)

var nodeCmd = &cobra.Command{
	Use:   "node",
	Short: "Start a BlackTrace node",
	Long: `Start a BlackTrace node that participates in the P2P network.

The node will:
  - Listen for incoming peer connections on the specified port
  - Start HTTP API server for CLI communication
  - Automatically discover peers via mDNS
  - Handle order announcements and negotiations
  - Manage HTLC settlements (when on-chain integration is ready)`,
	Run: runNode,
}

func init() {
	rootCmd.AddCommand(nodeCmd)

	nodeCmd.Flags().IntVarP(&nodePort, "port", "p", 9000, "Port to listen on for P2P")
	nodeCmd.Flags().IntVar(&apiPort, "api-port", 8080, "Port for HTTP API server")
	nodeCmd.Flags().StringVarP(&connectAddr, "connect", "c", "", "Multiaddr of peer to connect to (optional)")
}

func runNode(cmd *cobra.Command, args []string) {
	fmt.Printf("╔══════════════════════════════════════════════╗\n")
	fmt.Printf("║   BlackTrace Node                           ║\n")
	fmt.Printf("╚══════════════════════════════════════════════╝\n\n")

	fmt.Printf("🚀 Starting BlackTrace node...\n")
	fmt.Printf("   P2P Port: %d\n", nodePort)
	fmt.Printf("   API Port: %d\n\n", apiPort)

	// Create and start the application
	app, err := node.NewBlackTraceApp(nodePort)
	if err != nil {
		log.Fatalf("Failed to create app: %v", err)
	}
	app.Run()

	// Start API server
	apiServer := node.NewAPIServer(app, apiPort)
	if err := apiServer.Start(); err != nil {
		log.Fatalf("Failed to start API server: %v", err)
	}

	// Get node status
	status := app.GetStatus()
	fmt.Printf("✅ Node started successfully!\n\n")
	fmt.Printf("📍 Node Info:\n")
	fmt.Printf("   Peer ID: %s\n", status.PeerID)
	fmt.Printf("   Listening on: %s\n\n", status.ListenAddr)
	fmt.Printf("🔌 API Server: http://localhost:%d\n", apiPort)

	// Show multiaddr for connecting
	fmt.Printf("\n🔍 Use this multiaddr to connect other nodes:\n")
	fmt.Printf("   /ip4/127.0.0.1/tcp/%d/p2p/%s\n", nodePort, status.PeerID)

	// Connect to peer if specified
	if connectAddr != "" {
		fmt.Printf("\n🔗 Connecting to peer: %s\n", connectAddr)
		app.ConnectToPeer(connectAddr)
	}

	fmt.Printf("\nNode is running. Press Ctrl+C to stop.\n\n")

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\n👋 Shutting down node...")
	apiServer.Stop()
	app.Shutdown()
}
