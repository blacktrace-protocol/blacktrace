use async_nats::Client;
use chrono::{DateTime, Utc};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::env;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Settlement request from the Go coordination layer
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SettlementRequest {
    proposal_id: String,
    order_id: String,
    maker_id: String,
    taker_id: String,
    amount: u64,
    price: u64,
    stablecoin: String,
    settlement_chain: String,
    timestamp: DateTime<Utc>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "settlement_service=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("🦀 BlackTrace Settlement Service starting...");

    // Get NATS URL from environment
    let nats_url = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    info!("Connecting to NATS at {}", nats_url);

    // Connect to NATS
    let client = async_nats::connect(&nats_url).await?;
    info!("✓ Connected to NATS");

    // Subscribe to settlement requests
    let subject = "settlement.request.*";
    info!("Subscribing to subject: {}", subject);
    let mut subscriber = client.subscribe(subject).await?;
    info!("✓ Subscribed to settlement requests");

    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    info!("Settlement service is ready and listening...");
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    info!("");

    // Process messages
    while let Some(message) = subscriber.next().await {
        match serde_json::from_slice::<SettlementRequest>(&message.payload) {
            Ok(request) => {
                info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                info!("📩 NEW SETTLEMENT REQUEST RECEIVED");
                info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                info!("");
                info!("  Proposal ID:       {}", request.proposal_id);
                info!("  Order ID:          {}", request.order_id);
                info!("");
                info!("  👥 Parties:");
                info!("     Maker (Alice):  {}", truncate_peer_id(&request.maker_id, 16));
                info!("     Taker (Bob):    {}", truncate_peer_id(&request.taker_id, 16));
                info!("");
                info!("  💰 Trade Details:");
                info!("     Amount:         {} ZEC", request.amount);
                info!("     Price:          ${}", request.price);
                info!("     Stablecoin:     {}", request.stablecoin);
                info!("     Total Value:    ${}", (request.amount as f64 * request.price as f64) / 1_000_000.0);
                info!("");
                info!("  ⛓️  Settlement:");
                info!("     ZEC Chain:      Zcash L1 (Orchard)");
                info!("     Stablecoin:     {} on {}", request.stablecoin, request.settlement_chain);
                info!("");
                info!("  🕐 Timestamp:      {}", request.timestamp);
                info!("");
                info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                info!("🔄 Next Steps (to be implemented):");
                info!("  1. Generate HTLC secret and hash");
                info!("  2. Create Zcash HTLC (Alice locks {} ZEC)", request.amount);
                info!("  3. Create {} HTLC (Bob locks ${} {})",
                      request.settlement_chain,
                      (request.amount as f64 * request.price as f64) / 1_000_000.0,
                      request.stablecoin);
                info!("  4. Monitor HTLC claims and reveal secret");
                info!("  5. Complete atomic swap");
                info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                info!("");
            }
            Err(e) => {
                error!("Failed to deserialize settlement request: {}", e);
                warn!("Raw payload: {:?}", String::from_utf8_lossy(&message.payload));
            }
        }
    }

    Ok(())
}

/// Truncate a peer ID for display
fn truncate_peer_id(peer_id: &str, len: usize) -> String {
    if peer_id.len() <= len {
        peer_id.to_string()
    } else {
        format!("{}...", &peer_id[..len])
    }
}
