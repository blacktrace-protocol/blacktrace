use async_nats::Client;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use futures::StreamExt;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::sync::Arc;
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

/// Settlement status update from Go backend
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SettlementStatusUpdate {
    proposal_id: String,
    order_id: String,
    settlement_status: String,
    action: String,
    #[serde(default)]
    amount: u64,
    #[serde(default)]
    amount_usdc: u64,
    timestamp: DateTime<Utc>,
}

/// Settlement state for tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SettlementState {
    proposal_id: String,
    order_id: String,
    maker_id: String,
    taker_id: String,
    amount_zec: u64,
    amount_usdc: u64,
    secret: Vec<u8>,
    hash_hex: String,
    status: String,
    zec_locked: bool,
    usdc_locked: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

/// Settlement service with state management
struct SettlementService {
    nats_client: Client,
    settlements: Arc<DashMap<String, SettlementState>>,
}

impl SettlementService {
    fn new(nats_client: Client) -> Self {
        Self {
            nats_client,
            settlements: Arc::new(DashMap::new()),
        }
    }

    /// Generate cryptographically secure secret and hash
    fn generate_secret_and_hash() -> (Vec<u8>, String) {
        // Generate 32-byte random secret
        let mut rng = rand::thread_rng();
        let secret: Vec<u8> = (0..32).map(|_| rng.gen()).collect();

        // Generate hash (SHA256 -> RIPEMD160 for Zcash compatibility)
        let sha_hash = Sha256::digest(&secret);
        let ripemd_hash = ripemd::Ripemd160::digest(&sha_hash);
        let hash_hex = hex::encode(ripemd_hash);

        (secret, hash_hex)
    }

    /// Handle new settlement request (when proposal is accepted)
    async fn handle_settlement_request(&self, request: SettlementRequest) {
        info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        info!("📩 NEW SETTLEMENT REQUEST");
        info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        info!("");
        info!("  Proposal ID: {}", request.proposal_id);
        info!("  Order ID:    {}", request.order_id);
        info!("");
        info!("  👥 Parties:");
        info!("     Maker:    {}", truncate_id(&request.maker_id, 16));
        info!("     Taker:    {}", truncate_id(&request.taker_id, 16));
        info!("");
        info!("  💰 Trade:");
        info!("     Amount:   {} ZEC", request.amount);
        info!("     Price:    ${}", request.price);
        info!("     Total:    ${}", request.amount * request.price);
        info!("");

        // Generate secret and hash for HTLC
        let (secret, hash_hex) = Self::generate_secret_and_hash();
        info!("  🔐 HTLC Generated:");
        info!("     Secret:   {} bytes (kept private)", secret.len());
        info!("     Hash:     {}", hash_hex);
        info!("");

        // Create settlement state
        let settlement = SettlementState {
            proposal_id: request.proposal_id.clone(),
            order_id: request.order_id.clone(),
            maker_id: request.maker_id.clone(),
            taker_id: request.taker_id.clone(),
            amount_zec: request.amount,
            amount_usdc: request.amount * request.price,
            secret,
            hash_hex: hash_hex.clone(),
            status: "ready".to_string(),
            zec_locked: false,
            usdc_locked: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        // Store settlement state
        self.settlements.insert(request.proposal_id.clone(), settlement);

        info!("  ✅ Settlement initialized");
        info!("  📌 Status: ready → waiting for Alice to lock ZEC");
        info!("");
        info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        info!("");

        // Publish HTLC parameters to NATS
        self.publish_htlc_params(&request.proposal_id, &hash_hex)
            .await;
    }

    /// Handle settlement status update (lock events from backend)
    async fn handle_status_update(&self, update: SettlementStatusUpdate) {
        info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        info!("📬 SETTLEMENT STATUS UPDATE");
        info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        info!("");
        info!("  Proposal ID: {}", update.proposal_id);
        info!("  Action:      {}", update.action);
        info!("  Status:      {}", update.settlement_status);
        info!("");

        // Get settlement state
        if let Some(mut settlement) = self.settlements.get_mut(&update.proposal_id) {
            match update.action.as_str() {
                "alice_lock_zec" => {
                    info!("  🔒 Alice is locking {} ZEC", update.amount);
                    settlement.zec_locked = true;
                    settlement.status = "alice_locked".to_string();
                    settlement.updated_at = Utc::now();

                    info!("");
                    info!("  ✅ ZEC lock confirmed");
                    info!("  📌 Status: alice_locked → waiting for Bob to lock USDC");
                    info!("");
                    info!("  💡 Next: Bob should lock ${} USDC", settlement.amount_usdc);
                }
                "bob_lock_usdc" => {
                    info!("  🔒 Bob is locking ${} USDC", update.amount_usdc);
                    settlement.usdc_locked = true;
                    settlement.status = "both_locked".to_string();
                    settlement.updated_at = Utc::now();

                    info!("");
                    info!("  ✅ USDC lock confirmed");
                    info!("  🎉 BOTH ASSETS LOCKED!");
                    info!("");
                    info!("  📌 Status: both_locked → ready for claiming");
                    info!("");

                    // Both assets locked - reveal secret for claiming
                    self.reveal_secret_for_claiming(&settlement).await;
                }
                _ => {
                    warn!("  ⚠️  Unknown action: {}", update.action);
                }
            }
        } else {
            warn!("  ⚠️  Settlement not found for proposal: {}", update.proposal_id);
        }

        info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        info!("");
    }

    /// Publish HTLC parameters to NATS
    async fn publish_htlc_params(&self, proposal_id: &str, hash_hex: &str) {
        let params = serde_json::json!({
            "proposal_id": proposal_id,
            "htlc_hash": hash_hex,
            "instruction_type": "htlc_params",
            "timestamp": Utc::now()
        });

        let subject = format!("settlement.htlc.{}", proposal_id);
        if let Err(e) = self
            .nats_client
            .publish(&subject, params.to_string().into())
            .await
        {
            error!("Failed to publish HTLC params: {}", e);
        } else {
            info!("  📤 Published HTLC params to NATS: {}", subject);
        }
    }

    /// Reveal secret for claiming when both assets are locked
    async fn reveal_secret_for_claiming(&self, settlement: &SettlementState) {
        info!("  🔓 REVEALING SECRET FOR ATOMIC SWAP");
        info!("");
        info!("  Secret (hex): {}", hex::encode(&settlement.secret));
        info!("  Hash (hex):   {}", settlement.hash_hex);
        info!("");
        info!("  💡 Claims:");
        info!("     1. Alice claims USDC on Starknet (reveals secret on-chain)");
        info!("     2. Bob sees secret on Starknet, claims ZEC on Zcash");
        info!("");

        // Publish secret reveal to NATS
        let reveal = serde_json::json!({
            "proposal_id": settlement.proposal_id,
            "instruction_type": "secret_reveal",
            "secret_hex": hex::encode(&settlement.secret),
            "hash_hex": settlement.hash_hex,
            "alice_can_claim": true,
            "bob_can_claim_after_alice": true,
            "timestamp": Utc::now()
        });

        let subject = format!("settlement.secret.{}", settlement.proposal_id);
        if let Err(e) = self
            .nats_client
            .publish(&subject, reveal.to_string().into())
            .await
        {
            error!("Failed to publish secret reveal: {}", e);
        } else {
            info!("  📤 Published secret reveal to NATS: {}", subject);
            info!("");
            info!("  ✨ ATOMIC SWAP READY FOR COMPLETION");
        }
    }

    /// Run the settlement service
    async fn run(self: Arc<Self>) -> Result<(), Box<dyn std::error::Error>> {
        // Subscribe to settlement requests
        let request_subject = "settlement.request.*";
        info!("📡 Subscribing to: {}", request_subject);
        let mut request_subscriber = self.nats_client.subscribe(request_subject).await?;
        info!("✓ Subscribed to settlement requests");

        // Subscribe to settlement status updates
        let status_subject = "settlement.status.*";
        info!("📡 Subscribing to: {}", status_subject);
        let mut status_subscriber = self.nats_client.subscribe(status_subject).await?;
        info!("✓ Subscribed to settlement status updates");

        info!("");
        info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        info!("🚀 Settlement Service is READY");
        info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        info!("");

        loop {
            tokio::select! {
                // Handle settlement requests
                Some(message) = request_subscriber.next() => {
                    match serde_json::from_slice::<SettlementRequest>(&message.payload) {
                        Ok(request) => {
                            self.handle_settlement_request(request).await;
                        }
                        Err(e) => {
                            error!("Failed to deserialize settlement request: {}", e);
                            warn!("Raw payload: {:?}", String::from_utf8_lossy(&message.payload));
                        }
                    }
                }

                // Handle status updates
                Some(message) = status_subscriber.next() => {
                    match serde_json::from_slice::<SettlementStatusUpdate>(&message.payload) {
                        Ok(update) => {
                            self.handle_status_update(update).await;
                        }
                        Err(e) => {
                            error!("Failed to deserialize status update: {}", e);
                            warn!("Raw payload: {:?}", String::from_utf8_lossy(&message.payload));
                        }
                    }
                }
            }
        }
    }
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

    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    info!("🦀 BlackTrace Settlement Service");
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    info!("");
    info!("  Version:     0.1.0 (MVP)");
    info!("  Mode:        Demo (service holds testnet keys)");
    info!("  HTLC:        Zcash <-> Starknet atomic swaps");
    info!("");

    // Get NATS URL from environment
    let nats_url = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    info!("  NATS URL:    {}", nats_url);
    info!("");

    // Connect to NATS
    info!("🔌 Connecting to NATS...");
    let client = async_nats::connect(&nats_url).await?;
    info!("✓ Connected to NATS");
    info!("");

    // Create and run settlement service
    let service = Arc::new(SettlementService::new(client));
    service.run().await
}

/// Truncate an ID for display
fn truncate_id(id: &str, len: usize) -> String {
    if id.len() <= len {
        id.to_string()
    } else {
        format!("{}...", &id[..len])
    }
}
