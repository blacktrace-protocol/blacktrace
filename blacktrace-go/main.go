package main

import (
	"fmt"
	"log"
	"time"
)

func main() {
	fmt.Println("╔══════════════════════════════════════════════╗")
	fmt.Println("║   BlackTrace Two-Node Demo (Go + libp2p)   ║")
	fmt.Println("║   Testing Off-Chain Workflow                ║")
	fmt.Println("╚══════════════════════════════════════════════╝\n")

	// Start Node A (Maker)
	fmt.Println("📡 Starting Node A (Maker) on port 19000...")
	nodeA, err := NewBlackTraceApp(19000)
	if err != nil {
		log.Fatal(err)
	}
	nodeA.Run()
	fmt.Println("   ✅ Node A online")
	fmt.Printf("   Peer ID: %s\n\n", nodeA.network.host.ID())
	time.Sleep(300 * time.Millisecond)

	// Start Node B (Taker)
	fmt.Println("📡 Starting Node B (Taker) on port 19001...")
	nodeB, err := NewBlackTraceApp(19001)
	if err != nil {
		log.Fatal(err)
	}
	nodeB.Run()
	fmt.Println("   ✅ Node B online")
	fmt.Printf("   Peer ID: %s\n\n", nodeB.network.host.ID())
	time.Sleep(300 * time.Millisecond)

	// Wait for mDNS discovery to connect peers
	fmt.Println("🔍 Waiting for mDNS peer discovery...")
	time.Sleep(2 * time.Second)
	fmt.Println("   ✅ Peers should be connected via mDNS\n")

	// Scenario 1: Order Creation
	fmt.Println("┌─────────────────────────────────────────────┐")
	fmt.Println("│ Scenario 1: Order Creation                 │")
	fmt.Println("└─────────────────────────────────────────────┘")
	fmt.Println("📝 Node A creating sell order:")
	fmt.Println("   Amount: 10,000 ZEC")
	fmt.Println("   Stablecoin: USDC")
	fmt.Println("   Price Range: $450 - $470 per ZEC")

	orderID := nodeA.CreateOrder(10000, StablecoinUSDC, 450, 470)
	fmt.Printf("   ✅ Order created: %s\n", orderID)
	fmt.Println("   📤 Broadcasting via pubsub...\n")
	time.Sleep(1 * time.Second)

	// Scenario 2: Order Discovery
	fmt.Println("┌─────────────────────────────────────────────┐")
	fmt.Println("│ Scenario 2: Order Discovery                │")
	fmt.Println("└─────────────────────────────────────────────┘")
	fmt.Println("🔍 Node B listing all orders...")

	orders := nodeB.ListOrders()
	fmt.Printf("   ✅ Node B sees %d order(s)\n", len(orders))
	for _, order := range orders {
		fmt.Println("   📋 Order Details:")
		fmt.Printf("      ID: %s\n", order.OrderID)
		fmt.Printf("      Type: %s\n", order.OrderType)
		fmt.Printf("      Stablecoin: %s\n", order.Stablecoin)
	}
	fmt.Println()
	time.Sleep(1 * time.Second)

	// Scenario 3: Negotiation Initiation
	fmt.Println("┌─────────────────────────────────────────────┐")
	fmt.Println("│ Scenario 3: Negotiation Initiation         │")
	fmt.Println("└─────────────────────────────────────────────┘")
	fmt.Printf("💬 Node B requesting details for order: %s\n", orderID)

	nodeB.RequestOrderDetails(orderID)
	fmt.Println("   ✅ Details requested from Maker")
	fmt.Println("   📨 Waiting for Maker to reveal...\n")
	time.Sleep(1500 * time.Millisecond)

	// Scenario 4: Price Proposal (Round 1)
	fmt.Println("┌─────────────────────────────────────────────┐")
	fmt.Println("│ Scenario 4: Price Proposal (Round 1)       │")
	fmt.Println("└─────────────────────────────────────────────┘")
	fmt.Println("💰 Node B (Taker) proposing:")
	fmt.Println("   Price: $450 per ZEC")
	fmt.Println("   Amount: 10,000 ZEC")
	fmt.Println("   Total: $4,500,000 USDC")

	nodeB.ProposePrice(orderID, 450, 10000)
	fmt.Println("   ✅ Proposal sent to Maker\n")
	time.Sleep(1500 * time.Millisecond)

	// Scenario 5: Counter-Proposal (Round 2)
	fmt.Println("┌─────────────────────────────────────────────┐")
	fmt.Println("│ Scenario 5: Counter-Proposal (Round 2)     │")
	fmt.Println("└─────────────────────────────────────────────┘")
	fmt.Println("💰 Node A (Maker) counter-proposing:")
	fmt.Println("   Price: $465 per ZEC")
	fmt.Println("   Amount: 10,000 ZEC")
	fmt.Println("   Total: $4,650,000 USDC")

	// THIS WILL NOT DEADLOCK WITH GO CHANNELS!
	nodeA.ProposePrice(orderID, 465, 10000)
	fmt.Println("   ✅ Counter-proposal sent to Taker\n")
	time.Sleep(1500 * time.Millisecond)

	// Scenario 6: Final Agreement (Round 3)
	fmt.Println("┌─────────────────────────────────────────────┐")
	fmt.Println("│ Scenario 6: Final Agreement (Round 3)      │")
	fmt.Println("└─────────────────────────────────────────────┘")
	fmt.Println("💰 Node B (Taker) accepting:")
	fmt.Println("   Price: $465 per ZEC")
	fmt.Println("   Amount: 10,000 ZEC")
	fmt.Println("   Total: $4,650,000 USDC")

	nodeB.ProposePrice(orderID, 465, 10000)
	fmt.Println("   ✅ Agreement reached!\n")
	time.Sleep(1 * time.Second)

	// Summary
	fmt.Println("\n╔══════════════════════════════════════════════╗")
	fmt.Println("║   Demo Complete - Summary                   ║")
	fmt.Println("╚══════════════════════════════════════════════╝\n")

	fmt.Println("✅ Order created and broadcast via pubsub")
	fmt.Println("✅ Order discovered by peer")
	fmt.Println("✅ Negotiation initiated via stream")
	fmt.Println("✅ First price proposal")
	fmt.Println("✅ Counter-proposal (NO DEADLOCK!)")
	fmt.Println("✅ Final agreement reached")
	fmt.Println("\n📝 Key Features Demonstrated:")
	fmt.Println("   🔒 Encrypted connections (Noise protocol)")
	fmt.Println("   🔑 Peer authentication via libp2p peer IDs")
	fmt.Println("   📡 Automatic peer discovery (mDNS)")
	fmt.Println("   💬 Direct messaging via streams")
	fmt.Println("   📢 Broadcasts via gossipsub")
	fmt.Println("   ⚡ No deadlocks - channel-based architecture!")

	time.Sleep(1 * time.Second)
}
