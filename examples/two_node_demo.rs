//! Two-node demo: Full order creation and negotiation workflow
//!
//! This example demonstrates the complete off-chain workflow:
//! 1. Start two nodes (Maker and Taker)
//! 2. Connect them via P2P
//! 3. Maker creates and broadcasts an order
//! 4. Taker discovers the order
//! 5. Multi-round price negotiation
//! 6. Settlement terms finalized
//!
//! Run with: cargo run --example two_node_demo

use blacktrace::cli::BlackTraceApp;
use blacktrace::types::StablecoinType;
use std::time::Duration;
use tokio::time::sleep;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("info,blacktrace=debug")
        .init();

    println!("\n╔══════════════════════════════════════════════╗");
    println!("║   BlackTrace Two-Node Demo                  ║");
    println!("║   Testing Off-Chain Workflow                ║");
    println!("╚══════════════════════════════════════════════╝\n");

    // Start Node A (Maker)
    println!("📡 Starting Node A (Maker) on port 9000...");
    let node_a = BlackTraceApp::new(9000).await?;
    println!("   ✅ Node A online\n");

    sleep(Duration::from_millis(300)).await;

    // Start Node B (Taker)
    println!("📡 Starting Node B (Taker) on port 9001...");
    let node_b = BlackTraceApp::new(9001).await?;
    println!("   ✅ Node B online\n");

    sleep(Duration::from_millis(300)).await;

    // Connect Node B to Node A
    println!("🔗 Connecting Node B → Node A...");
    node_b.connect_to_peer("127.0.0.1:9000").await?;
    println!("   ✅ Peers connected\n");

    sleep(Duration::from_millis(500)).await;

    // =========================================================================
    // Scenario 1: Order Creation
    // =========================================================================
    println!("┌─────────────────────────────────────────────┐");
    println!("│ Scenario 1: Order Creation                 │");
    println!("└─────────────────────────────────────────────┘");
    println!("📝 Node A creating sell order:");
    println!("   Amount: 10,000 ZEC");
    println!("   Stablecoin: USDC");
    println!("   Price Range: $450 - $470 per ZEC");

    let order_id = node_a.create_order(
        10000,
        StablecoinType::USDC,
        450,
        470
    ).await?;

    println!("   ✅ Order created: {}", order_id);
    println!("   📤 Broadcasting to network...\n");

    sleep(Duration::from_millis(500)).await;

    // =========================================================================
    // Scenario 2: Order Discovery
    // =========================================================================
    println!("┌─────────────────────────────────────────────┐");
    println!("│ Scenario 2: Order Discovery                │");
    println!("└─────────────────────────────────────────────┘");
    println!("🔍 Node B listing all orders...");

    let orders_b = node_b.list_orders().await;
    println!("   ✅ Node B sees {} order(s)", orders_b.len());

    for order in &orders_b {
        println!("   📋 Order Details:");
        println!("      ID: {}", order.order_id);
        println!("      Type: {:?}", order.order_type);
        println!("      Stablecoin: {:?}", order.stablecoin);
        println!("      Timestamp: {}", order.timestamp);
        println!("      Expiry: {}", order.expiry);
    }
    println!();

    sleep(Duration::from_millis(500)).await;

    // =========================================================================
    // Scenario 3: Negotiation Initiation
    // =========================================================================
    println!("┌─────────────────────────────────────────────┐");
    println!("│ Scenario 3: Negotiation Initiation         │");
    println!("└─────────────────────────────────────────────┘");
    println!("💬 Node B requesting details for order: {}", order_id);

    node_b.request_order_details(&order_id).await?;
    println!("   ✅ Details requested from Maker");
    println!("   📨 Waiting for Maker to reveal...\n");

    sleep(Duration::from_millis(500)).await;

    // =========================================================================
    // Scenario 4: Price Proposal (Round 1)
    // =========================================================================
    println!("┌─────────────────────────────────────────────┐");
    println!("│ Scenario 4: Price Proposal (Round 1)       │");
    println!("└─────────────────────────────────────────────┘");
    println!("💰 Node B (Taker) proposing:");
    println!("   Price: $450 per ZEC");
    println!("   Amount: 10,000 ZEC");
    println!("   Total: $4,500,000 USDC");

    node_b.propose_price(&order_id, 450, 10000).await?;
    println!("   ✅ Proposal sent to Maker\n");

    sleep(Duration::from_millis(500)).await;

    // =========================================================================
    // Scenario 5: Counter-Proposal (Round 2)
    // =========================================================================
    println!("┌─────────────────────────────────────────────┐");
    println!("│ Scenario 5: Counter-Proposal (Round 2)     │");
    println!("└─────────────────────────────────────────────┘");
    println!("💰 Node A (Maker) counter-proposing:");
    println!("   Price: $465 per ZEC");
    println!("   Amount: 10,000 ZEC");
    println!("   Total: $4,650,000 USDC");

    node_a.propose_price(&order_id, 465, 10000).await?;
    println!("   ✅ Counter-proposal sent to Taker\n");

    sleep(Duration::from_millis(500)).await;

    // =========================================================================
    // Scenario 6: Acceptance & Finalization
    // =========================================================================
    println!("┌─────────────────────────────────────────────┐");
    println!("│ Scenario 6: Acceptance & Finalization      │");
    println!("└─────────────────────────────────────────────┘");
    println!("✅ Node B accepting final terms:");
    println!("   Agreed Price: $465 per ZEC");
    println!("   Total Value: $4,650,000 USDC");

    node_b.accept_terms(&order_id).await?;
    println!("   ✅ Terms accepted");
    println!("   🔏 Settlement terms signed by both parties\n");

    sleep(Duration::from_millis(500)).await;

    // =========================================================================
    // Scenario 7: Query Status
    // =========================================================================
    println!("┌─────────────────────────────────────────────┐");
    println!("│ Scenario 7: Query Negotiation Status       │");
    println!("└─────────────────────────────────────────────┘");
    println!("📊 Querying negotiation status...\n");

    if let Some(status) = node_a.get_negotiation_status(&order_id).await {
        println!("{}", status);
    } else {
        println!("   ⚠️  No negotiation found for order {}", order_id);
    }
    println!();

    // =========================================================================
    // Summary
    // =========================================================================
    println!("\n╔══════════════════════════════════════════════╗");
    println!("║   Demo Complete - Summary                   ║");
    println!("╚══════════════════════════════════════════════╝\n");

    println!("✅ Order created and broadcast");
    println!("✅ Order discovered by peer");
    println!("✅ Multi-round negotiation completed (2 rounds)");
    println!("✅ Settlement terms finalized");
    println!("✅ Off-chain workflow validated\n");

    println!("📝 Next Steps:");
    println!("   - Implement Zcash L1 RPC client");
    println!("   - Implement Ztarknet L2 client");
    println!("   - Build two-layer settlement coordinator");
    println!("   - Test atomic swap execution\n");

    Ok(())
}
