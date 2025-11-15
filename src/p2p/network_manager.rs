//! Simple TCP-based P2P Network Manager

use crate::error::{BlackTraceError, Result};
use crate::types::PeerID;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex};

/// Network events that can occur
#[derive(Debug, Clone)]
pub enum NetworkEvent {
    /// New peer connected
    PeerConnected(PeerID),
    /// Peer disconnected
    PeerDisconnected(PeerID),
    /// Message received from peer
    MessageReceived { from: PeerID, data: Vec<u8> },
}

/// Peer connection state
struct PeerConnection {
    writer: Arc<Mutex<tokio::io::WriteHalf<TcpStream>>>,
}

/// Simple TCP-based P2P Network Manager
pub struct NetworkManager {
    local_peer_id: PeerID,
    listen_addr: String,
    peers: Arc<Mutex<HashMap<PeerID, PeerConnection>>>,
    event_tx: mpsc::UnboundedSender<NetworkEvent>,
    event_rx: Arc<Mutex<mpsc::UnboundedReceiver<NetworkEvent>>>,
}

impl NetworkManager {
    /// Create a new NetworkManager and start listening
    pub async fn new(listen_port: u16) -> Result<Self> {
        // Generate a random peer ID for this node
        let local_peer_id = PeerID(format!("peer_{}", rand::random::<u32>()));
        let listen_addr = format!("127.0.0.1:{}", listen_port);

        let (event_tx, event_rx) = mpsc::unbounded_channel();
        let peers = Arc::new(Mutex::new(HashMap::new()));

        let manager = NetworkManager {
            local_peer_id: local_peer_id.clone(),
            listen_addr: listen_addr.clone(),
            peers: peers.clone(),
            event_tx: event_tx.clone(),
            event_rx: Arc::new(Mutex::new(event_rx)),
        };

        // Start listening for incoming connections
        let listen_addr_clone = listen_addr.clone();
        let peers_clone = peers.clone();
        let event_tx_clone = event_tx.clone();
        let local_id_clone = local_peer_id.clone();

        tokio::spawn(async move {
            if let Err(e) = Self::listen_loop(
                listen_addr_clone,
                peers_clone,
                event_tx_clone,
                local_id_clone,
            )
            .await
            {
                tracing::error!("Listen loop error: {}", e);
            }
        });

        Ok(manager)
    }

    /// Get local peer ID
    pub fn local_peer_id(&self) -> &PeerID {
        &self.local_peer_id
    }

    /// Get listen address
    pub fn listen_addr(&self) -> &str {
        &self.listen_addr
    }

    /// Connect to a peer
    pub async fn connect_to_peer(&self, addr: &str) -> Result<PeerID> {
        let stream = TcpStream::connect(addr)
            .await
            .map_err(|e| BlackTraceError::NetworkConnection(e.to_string()))?;

        let peer_addr = stream
            .peer_addr()
            .map_err(|e| BlackTraceError::NetworkConnection(e.to_string()))?;
        let peer_id = PeerID(format!("peer_{}", peer_addr));

        let (reader, writer) = tokio::io::split(stream);

        // Store the connection
        let conn = PeerConnection {
            writer: Arc::new(Mutex::new(writer)),
        };

        self.peers.lock().await.insert(peer_id.clone(), conn);

        // Send connection event
        let _ = self.event_tx.send(NetworkEvent::PeerConnected(peer_id.clone()));

        // Start reading from this peer
        let peer_id_clone = peer_id.clone();
        let event_tx = self.event_tx.clone();
        let peers = self.peers.clone();

        tokio::spawn(async move {
            if let Err(e) = Self::read_loop(peer_id_clone.clone(), reader, event_tx.clone(), peers.clone()).await {
                tracing::debug!("Read loop ended for {}: {}", peer_id_clone, e);
                // Send disconnect event
                let _ = event_tx.send(NetworkEvent::PeerDisconnected(peer_id_clone.clone()));
                // Remove from peers
                peers.lock().await.remove(&peer_id_clone);
            }
        });

        Ok(peer_id)
    }

    /// Broadcast a message to all connected peers
    pub async fn broadcast(&self, message: Vec<u8>) -> Result<()> {
        let peers = self.peers.lock().await;

        for (peer_id, conn) in peers.iter() {
            if let Err(e) = self.send_to_peer_internal(peer_id, &message, conn).await {
                tracing::warn!("Failed to send to {}: {}", peer_id, e);
            }
        }

        Ok(())
    }

    /// Send a message to a specific peer
    pub async fn send_to_peer(&self, peer_id: &PeerID, message: Vec<u8>) -> Result<()> {
        let peers = self.peers.lock().await;

        if let Some(conn) = peers.get(peer_id) {
            self.send_to_peer_internal(peer_id, &message, conn).await
        } else {
            Err(BlackTraceError::PeerNotFound(peer_id.0.clone()))
        }
    }

    /// Internal helper to send to a peer
    async fn send_to_peer_internal(
        &self,
        peer_id: &PeerID,
        message: &[u8],
        conn: &PeerConnection,
    ) -> Result<()> {
        let mut writer = conn.writer.lock().await;

        // Send message length prefix (4 bytes)
        let len = message.len() as u32;
        writer
            .write_all(&len.to_be_bytes())
            .await
            .map_err(|e| BlackTraceError::MessageRouting(e.to_string()))?;

        // Send message data
        writer
            .write_all(message)
            .await
            .map_err(|e| BlackTraceError::MessageRouting(e.to_string()))?;

        writer
            .flush()
            .await
            .map_err(|e| BlackTraceError::MessageRouting(e.to_string()))?;

        tracing::debug!("Sent {} bytes to {}", message.len(), peer_id);
        Ok(())
    }

    /// Get list of connected peers
    pub async fn connected_peers(&self) -> Vec<PeerID> {
        self.peers.lock().await.keys().cloned().collect()
    }

    /// Poll for network events (non-blocking)
    pub async fn poll_events(&self) -> Option<NetworkEvent> {
        self.event_rx.lock().await.try_recv().ok()
    }

    /// Listen loop for incoming connections
    async fn listen_loop(
        listen_addr: String,
        peers: Arc<Mutex<HashMap<PeerID, PeerConnection>>>,
        event_tx: mpsc::UnboundedSender<NetworkEvent>,
        local_id: PeerID,
    ) -> Result<()> {
        let listener = TcpListener::bind(&listen_addr)
            .await
            .map_err(|e| BlackTraceError::NetworkConnection(e.to_string()))?;

        tracing::info!("Listening on {} as {}", listen_addr, local_id);

        loop {
            match listener.accept().await {
                Ok((stream, addr)) => {
                    let peer_id = PeerID(format!("peer_{}", addr));
                    tracing::info!("New connection from {}", addr);

                    let (reader, writer) = tokio::io::split(stream);

                    let conn = PeerConnection {
                        writer: Arc::new(Mutex::new(writer)),
                    };

                    peers.lock().await.insert(peer_id.clone(), conn);

                    let _ = event_tx.send(NetworkEvent::PeerConnected(peer_id.clone()));

                    // Start reading from this peer
                    let peer_id_clone = peer_id.clone();
                    let event_tx_clone = event_tx.clone();
                    let peers_clone = peers.clone();

                    tokio::spawn(async move {
                        if let Err(e) = Self::read_loop(
                            peer_id_clone.clone(),
                            reader,
                            event_tx_clone.clone(),
                            peers_clone.clone(),
                        )
                        .await
                        {
                            tracing::debug!("Read loop ended for {}: {}", peer_id_clone, e);
                            let _ = event_tx_clone.send(NetworkEvent::PeerDisconnected(peer_id_clone.clone()));
                            peers_clone.lock().await.remove(&peer_id_clone);
                        }
                    });
                }
                Err(e) => {
                    tracing::error!("Accept error: {}", e);
                }
            }
        }
    }

    /// Read loop for a peer connection
    async fn read_loop(
        peer_id: PeerID,
        reader: tokio::io::ReadHalf<TcpStream>,
        event_tx: mpsc::UnboundedSender<NetworkEvent>,
        _peers: Arc<Mutex<HashMap<PeerID, PeerConnection>>>,
    ) -> Result<()> {
        let mut reader = BufReader::new(reader);
        let mut len_buf = [0u8; 4];

        loop {
            // Read message length
            use tokio::io::AsyncReadExt;
            reader
                .read_exact(&mut len_buf)
                .await
                .map_err(|e| BlackTraceError::NetworkConnection(e.to_string()))?;

            let len = u32::from_be_bytes(len_buf) as usize;

            // Read message data
            let mut data = vec![0u8; len];
            reader
                .read_exact(&mut data)
                .await
                .map_err(|e| BlackTraceError::NetworkConnection(e.to_string()))?;

            tracing::debug!("Received {} bytes from {}", len, peer_id);

            // Send event
            let _ = event_tx.send(NetworkEvent::MessageReceived {
                from: peer_id.clone(),
                data,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_network_creation() {
        let manager = NetworkManager::new(0).await;
        assert!(manager.is_ok());

        let manager = manager.unwrap();
        assert!(!manager.local_peer_id().0.is_empty());
        assert!(manager.listen_addr().starts_with("127.0.0.1:"));
    }

    #[tokio::test]
    async fn test_two_nodes_connect() {
        // Create two nodes
        let node1 = NetworkManager::new(9000).await.unwrap();
        let node2 = NetworkManager::new(9001).await.unwrap();

        // Give listeners time to start
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Node2 connects to Node1
        let _peer_id = node2.connect_to_peer("127.0.0.1:9000").await.unwrap();

        // Give it a moment to establish
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Check node2 has node1 as peer
        let peers = node2.connected_peers().await;
        assert_eq!(peers.len(), 1);

        // Check events
        let event1 = node1.poll_events().await;
        assert!(matches!(event1, Some(NetworkEvent::PeerConnected(_))));
    }

    #[tokio::test]
    async fn test_message_sending() {
        let node1 = NetworkManager::new(9002).await.unwrap();
        let node2 = NetworkManager::new(9003).await.unwrap();

        // Give listeners time to start
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Connect
        let peer_id = node2.connect_to_peer("127.0.0.1:9002").await.unwrap();
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Send message from node2 to node1
        let message = b"Hello, Node1!".to_vec();
        node2.send_to_peer(&peer_id, message.clone()).await.unwrap();

        // Give it a moment
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Check node1 received it
        let event = node1.poll_events().await;
        if let Some(NetworkEvent::MessageReceived { data, .. }) = event {
            assert_eq!(data, message);
        } else {
            // Skip connection event and check next
            let event = node1.poll_events().await;
            if let Some(NetworkEvent::MessageReceived { data, .. }) = event {
                assert_eq!(data, message);
            } else {
                panic!("Expected MessageReceived event");
            }
        }
    }
}
