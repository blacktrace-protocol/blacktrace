//! BlackTrace application integrating all components

use crate::crypto::{generate_commitment, generate_random_salt};
use crate::error::Result;
use crate::negotiation::{NegotiationEngine, OrderDetails};
use crate::p2p::{NetworkEvent, NetworkManager, OrderAnnouncement};
use crate::types::{OrderID, OrderType, PeerID, StablecoinType};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Main BlackTrace application
#[derive(Clone)]
pub struct BlackTraceApp {
    network: Arc<Mutex<NetworkManager>>,
    negotiation: Arc<Mutex<NegotiationEngine>>,
    orders: Arc<Mutex<HashMap<OrderID, OrderAnnouncement>>>,
    viewing_key: Vec<u8>, // Simplified - in production, derive from wallet
}

impl BlackTraceApp {
    /// Create a new BlackTrace application
    pub async fn new(port: u16) -> Result<Self> {
        let network = NetworkManager::new(port).await?;
        let negotiation = NegotiationEngine::new();

        // Generate a simple viewing key (in production, from wallet)
        let viewing_key = vec![42u8; 32];

        Ok(Self {
            network: Arc::new(Mutex::new(network)),
            negotiation: Arc::new(Mutex::new(negotiation)),
            orders: Arc::new(Mutex::new(HashMap::new())),
            viewing_key,
        })
    }

    /// Get network manager
    pub fn network(&self) -> Arc<Mutex<NetworkManager>> {
        self.network.clone()
    }

    /// Get negotiation engine
    pub fn negotiation(&self) -> Arc<Mutex<NegotiationEngine>> {
        self.negotiation.clone()
    }

    /// Get orders
    pub fn orders(&self) -> Arc<Mutex<HashMap<OrderID, OrderAnnouncement>>> {
        self.orders.clone()
    }

    /// Connect to a peer
    pub async fn connect_to_peer(&self, addr: &str) -> Result<PeerID> {
        self.network.lock().await.connect_to_peer(addr).await
    }

    /// Create and broadcast a new order
    pub async fn create_order(
        &self,
        amount: u64,
        stablecoin: StablecoinType,
        _min_price: u64,
        _max_price: u64,
    ) -> Result<OrderID> {
        let order_id = OrderID::generate();

        // Generate commitment proof
        let salt = generate_random_salt();
        let commitment = generate_commitment(
            amount,
            &salt,
            amount, // min_amount = amount for now
            &self.viewing_key,
            &order_id,
        )?;

        // Create order announcement
        let announcement = OrderAnnouncement {
            order_id: order_id.clone(),
            order_type: OrderType::Sell, // For MVP, only sell orders
            stablecoin,
            encrypted_details: vec![], // Simplified - will encrypt in production
            proof_commitment: commitment.commitment_hash,
            timestamp: commitment.timestamp,
            expiry: commitment.timestamp + 3600, // 1 hour expiry
        };

        // Store locally
        self.orders
            .lock()
            .await
            .insert(order_id.clone(), announcement.clone());

        // Broadcast to network
        let message = serde_json::to_vec(&announcement).unwrap();
        self.network.lock().await.broadcast(message).await?;

        tracing::info!("Created and broadcasted order: {}", order_id);

        Ok(order_id)
    }

    /// List all known orders
    pub async fn list_orders(&self) -> Vec<OrderAnnouncement> {
        self.orders.lock().await.values().cloned().collect()
    }

    /// Start negotiation (request order details)
    pub async fn request_order_details(&self, order_id: &OrderID) -> Result<()> {
        // Find the order to get the maker
        let orders = self.orders.lock().await;
        let _order = orders
            .get(order_id)
            .ok_or_else(|| crate::error::BlackTraceError::OrderNotFound(order_id.0.clone()))?;

        // In production, we'd get the maker's peer ID from the order
        // For now, just use first connected peer
        let peers = self.network.lock().await.connected_peers().await;
        if peers.is_empty() {
            return Err(crate::error::BlackTraceError::PeerNotFound(
                "No peers connected".to_string(),
            ));
        }

        let maker_peer = peers[0].clone();

        // Request details
        let message = self
            .negotiation
            .lock()
            .await
            .request_order_details(order_id.clone(), maker_peer.clone())?;

        // Send to maker
        self.network
            .lock()
            .await
            .send_to_peer(&maker_peer, message)
            .await?;

        tracing::info!("Requested details for order: {}", order_id);

        Ok(())
    }

    /// Propose a price
    pub async fn propose_price(&self, order_id: &OrderID, price: u64, amount: u64) -> Result<()> {
        let message = self
            .negotiation
            .lock()
            .await
            .propose_terms(order_id, price, amount)?;

        // Get the counterparty from the session
        let session = self
            .negotiation
            .lock()
            .await
            .get_session(order_id)
            .ok_or_else(|| crate::error::BlackTraceError::SessionNotFound(order_id.0.clone()))?
            .clone();

        let counterparty = session.counterparty().clone();

        // Send proposal
        self.network
            .lock()
            .await
            .send_to_peer(&counterparty, message)
            .await?;

        tracing::info!("Proposed price {} for order {}", price, order_id);

        Ok(())
    }

    /// Accept terms and finalize
    pub async fn accept_terms(&self, order_id: &OrderID) -> Result<()> {
        // Get latest proposal details
        let session = self
            .negotiation
            .lock()
            .await
            .get_session(order_id)
            .ok_or_else(|| crate::error::BlackTraceError::SessionNotFound(order_id.0.clone()))?
            .clone();

        let latest_price = session
            .latest_price()
            .ok_or_else(|| crate::error::BlackTraceError::InvalidProposal("No proposals yet".to_string()))?;

        // Create settlement terms
        let terms = crate::negotiation::SettlementTerms {
            order_id: order_id.clone(),
            zec_amount: 10000, // Simplified - get from order
            stablecoin_amount: latest_price * 10000,
            stablecoin_type: StablecoinType::USDC,
            maker_address: "zs1maker...".to_string(),
            taker_address: "zs1taker...".to_string(),
            secret_hash: crate::types::Hash::from_bytes(b"secret"),
            timelock_blocks: 144,
        };

        // Finalize
        let signed = self
            .negotiation
            .lock()
            .await
            .accept_and_finalize(order_id, terms)?;

        tracing::info!(
            "Finalized settlement for order {}: {} ZEC for {} {}",
            order_id,
            signed.terms.zec_amount,
            signed.terms.stablecoin_amount,
            match signed.terms.stablecoin_type {
                StablecoinType::USDC => "USDC",
                StablecoinType::USDT => "USDT",
                StablecoinType::DAI => "DAI",
            }
        );

        Ok(())
    }

    /// Get negotiation status
    pub async fn get_negotiation_status(&self, order_id: &OrderID) -> Option<String> {
        let negotiation = self.negotiation.lock().await;
        let session = negotiation.get_session(order_id)?;

        let status = format!(
            "Order: {}\nRole: {:?}\nCounterparty: {}\nProposals: {}\nLatest Price: {:?}\nComplete: {}",
            order_id,
            session.role(),
            session.counterparty(),
            session.proposals().len(),
            session.latest_price(),
            session.is_complete()
        );

        Some(status)
    }

    /// Run the event loop
    pub async fn run_event_loop(&self) {
        loop {
            // Poll for network events
            if let Some(event) = self.network.lock().await.poll_events().await {
                if let Err(e) = self.handle_network_event(event).await {
                    tracing::error!("Error handling network event: {}", e);
                }
            }

            // Small sleep to prevent busy-waiting
            tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
        }
    }

    /// Handle network events
    async fn handle_network_event(&self, event: NetworkEvent) -> Result<()> {
        match event {
            NetworkEvent::PeerConnected(peer_id) => {
                tracing::info!("Peer connected: {}", peer_id);
            }
            NetworkEvent::PeerDisconnected(peer_id) => {
                tracing::info!("Peer disconnected: {}", peer_id);
            }
            NetworkEvent::MessageReceived { from, data } => {
                // Try to deserialize as order announcement
                if let Ok(announcement) = serde_json::from_slice::<OrderAnnouncement>(&data) {
                    tracing::info!("Received order announcement: {}", announcement.order_id);
                    self.orders
                        .lock()
                        .await
                        .insert(announcement.order_id.clone(), announcement);
                    return Ok(());
                }

                // Try to deserialize as order details request (just an OrderID)
                if let Ok(order_id) = serde_json::from_slice::<OrderID>(&data) {
                    tracing::info!("Received order details request: {}", order_id);

                    // Get order from local storage
                    let orders = self.orders.lock().await;
                    if let Some(order) = orders.get(&order_id) {
                        tracing::debug!("Found order, preparing details...");

                        // Reveal order details
                        let details = OrderDetails {
                            order_id: order_id.clone(),
                            order_type: order.order_type.clone(),
                            amount: 10000, // Simplified - should decrypt from order
                            min_price: 450, // Simplified
                            max_price: 470, // Simplified
                            stablecoin: order.stablecoin.clone(),
                        };

                        drop(orders); // Release lock before calling negotiation engine

                        tracing::debug!("Creating negotiation session...");
                        let response = self.negotiation
                            .lock()
                            .await
                            .reveal_order_details(&order_id, details, from.clone())?;

                        tracing::debug!("Sending order details response...");
                        // Send response back to requester
                        self.network.lock().await.send_to_peer(&from, response).await?;
                        tracing::info!("Sent order details to {}", from);
                    } else {
                        tracing::warn!("Order {} not found in local storage", order_id);
                    }
                    return Ok(());
                }

                // Try to deserialize as order details
                if let Ok(details) = serde_json::from_slice::<OrderDetails>(&data) {
                    tracing::info!("Received order details: {}", details.order_id);
                    self.negotiation
                        .lock()
                        .await
                        .handle_message(&details.order_id, data)?;
                    return Ok(());
                }

                // Try to deserialize as proposal
                use crate::negotiation::Proposal;
                if let Ok(proposal) = serde_json::from_slice::<Proposal>(&data) {
                    tracing::info!("Received proposal: {} per unit", proposal.price);
                    // Proposals don't have order_id embedded, need to track separately
                    // For now, just log
                    return Ok(());
                }

                // Unknown message type
                tracing::debug!("Received {} bytes from {}", data.len(), from);
            }
        }

        Ok(())
    }
}
