package node

import (
	"bufio"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"sync"
	"time"

	"github.com/libp2p/go-libp2p"
	pubsub "github.com/libp2p/go-libp2p-pubsub"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/core/protocol"
	"github.com/libp2p/go-libp2p/p2p/discovery/mdns"
	"github.com/multiformats/go-multiaddr"
)

const (
	BlackTraceProtocolID = "/blacktrace/1.0.0"
	BlackTracePubSubTopic = "blacktrace-orders"
)

// NetworkEvent represents events from the network layer
type NetworkEvent struct {
	Type string // "peer_connected", "peer_disconnected", "message_received"
	From PeerID
	Data []byte
}

// NetworkCommand represents commands to the network layer
type NetworkCommand struct {
	Type string // "connect", "send", "broadcast", "shutdown"
	Addr string
	To   PeerID
	Data []byte
}

// NetworkManager handles P2P networking with libp2p
type NetworkManager struct {
	ctx        context.Context
	host       host.Host
	pubsub     *pubsub.PubSub
	topic      *pubsub.Topic
	sub        *pubsub.Subscription

	peers      map[PeerID]peer.ID
	peersMux   sync.RWMutex

	// Bootstrap mode: if true, this node only accepts connections (doesn't dial out)
	isBootstrap bool

	// Channels - THE KEY: No mutexes for message passing!
	eventCh    chan NetworkEvent
	commandCh  chan NetworkCommand
	shutdownCh chan struct{}
}

// discoveryNotifee implements mDNS peer discovery
type discoveryNotifee struct {
	nm *NetworkManager
}

func (n *discoveryNotifee) HandlePeerFound(pi peer.AddrInfo) {
	log.Printf("Discovered peer via mDNS: %s", pi.ID)

	// Bootstrap nodes don't dial out - they only accept connections
	if n.nm.isBootstrap {
		log.Printf("Bootstrap mode: waiting for peer %s to connect to us", pi.ID)
		return
	}

	// Connect in background with retry logic
	go n.connectWithRetry(pi)
}

func (n *discoveryNotifee) connectWithRetry(pi peer.AddrInfo) {
	// Wait a bit to let the peer fully initialize
	time.Sleep(500 * time.Millisecond)

	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		log.Printf("Connecting to discovered peer: %s (attempt %d/%d)", pi.ID, i+1, maxRetries)

		if err := n.nm.host.Connect(n.nm.ctx, pi); err != nil {
			log.Printf("Failed to connect to discovered peer (attempt %d/%d): %v", i+1, maxRetries, err)
			if i < maxRetries-1 {
				time.Sleep(time.Second * time.Duration(i+1)) // Exponential backoff
			}
		} else {
			log.Printf("Successfully connected to peer: %s", pi.ID)
			return
		}
	}
	log.Printf("Gave up connecting to peer %s after %d attempts", pi.ID, maxRetries)
}

// NewNetworkManager creates a new libp2p-based network manager
// If port is the first port (e.g., 19000), it becomes a bootstrap node
func NewNetworkManager(port int) (*NetworkManager, error) {
	isBootstrap := (port == 19000) // First node is bootstrap
	ctx := context.Background()

	// Create multiaddress for listening
	// Use 0.0.0.0 to listen on all interfaces (required for Docker networking)
	listenAddr, err := multiaddr.NewMultiaddr(fmt.Sprintf("/ip4/0.0.0.0/tcp/%d", port))
	if err != nil {
		return nil, err
	}

	// Create libp2p host with security (Noise) and multiplexing (yamux)
	h, err := libp2p.New(
		libp2p.ListenAddrs(listenAddr),
		libp2p.DefaultSecurity, // Includes Noise protocol for encryption
		libp2p.DefaultMuxers,   // Includes yamux for stream multiplexing
	)
	if err != nil {
		return nil, err
	}

	log.Printf("LibP2P Host created with ID: %s", h.ID())
	log.Printf("Listening on: %s", h.Addrs())

	// Create pubsub (gossipsub for better reliability)
	ps, err := pubsub.NewGossipSub(ctx, h)
	if err != nil {
		return nil, err
	}

	// Join the blacktrace topic
	topic, err := ps.Join(BlackTracePubSubTopic)
	if err != nil {
		return nil, err
	}

	// Subscribe to the topic
	sub, err := topic.Subscribe()
	if err != nil {
		return nil, err
	}

	nm := &NetworkManager{
		ctx:         ctx,
		host:        h,
		pubsub:      ps,
		topic:       topic,
		sub:         sub,
		peers:       make(map[PeerID]peer.ID),
		isBootstrap: isBootstrap,
		eventCh:     make(chan NetworkEvent, 100),
		commandCh:   make(chan NetworkCommand, 100),
		shutdownCh:  make(chan struct{}),
	}

	if isBootstrap {
		log.Printf("Running in BOOTSTRAP mode - only accepting connections")
	} else {
		log.Printf("Running in REGULAR mode - will discover and connect to peers")
	}

	// Set stream handler for direct peer-to-peer messages
	h.SetStreamHandler(protocol.ID(BlackTraceProtocolID), nm.handleStream)

	// Setup mDNS for local peer discovery
	if err := nm.setupDiscovery(); err != nil {
		log.Printf("Warning: mDNS discovery setup failed: %v", err)
	}

	return nm, nil
}

// setupDiscovery configures mDNS for automatic peer discovery
func (nm *NetworkManager) setupDiscovery() error {
	notifee := &discoveryNotifee{nm: nm}
	mdnsService := mdns.NewMdnsService(nm.host, "blacktrace-mdns", notifee)
	return mdnsService.Start()
}

// Run starts the network manager (non-blocking)
func (nm *NetworkManager) Run() {
	// Monitor network events (peer connections/disconnections)
	go nm.monitorNetwork()

	// Listen to pubsub messages
	go nm.pubsubLoop()

	// Process commands from application
	go nm.commandLoop()
}

// EventChan returns the event channel (read-only for application)
func (nm *NetworkManager) EventChan() <-chan NetworkEvent {
	return nm.eventCh
}

// CommandChan returns the command channel (write-only for application)
func (nm *NetworkManager) CommandChan() chan<- NetworkCommand {
	return nm.commandCh
}

// monitorNetwork watches for peer connections and disconnections
func (nm *NetworkManager) monitorNetwork() {
	// Listen to network notifications
	nm.host.Network().Notify(&network.NotifyBundle{
		ConnectedF: func(n network.Network, conn network.Conn) {
			peerID := conn.RemotePeer()
			localPeerID := PeerID(peerID.String())

			nm.peersMux.Lock()
			nm.peers[localPeerID] = peerID
			nm.peersMux.Unlock()

			log.Printf("Peer connected: %s", peerID)

			nm.eventCh <- NetworkEvent{
				Type: "peer_connected",
				From: localPeerID,
			}
		},
		DisconnectedF: func(n network.Network, conn network.Conn) {
			peerID := conn.RemotePeer()
			localPeerID := PeerID(peerID.String())

			nm.peersMux.Lock()
			delete(nm.peers, localPeerID)
			nm.peersMux.Unlock()

			log.Printf("Peer disconnected: %s", peerID)

			nm.eventCh <- NetworkEvent{
				Type: "peer_disconnected",
				From: localPeerID,
			}
		},
	})
}

// handleStream handles incoming streams (direct peer-to-peer messages)
func (nm *NetworkManager) handleStream(s network.Stream) {
	defer s.Close()

	peerID := s.Conn().RemotePeer()
	localPeerID := PeerID(peerID.String())

	reader := bufio.NewReader(s)

	for {
		// Read length prefix (4 bytes, big endian)
		var length uint32
		if err := binary.Read(reader, binary.BigEndian, &length); err != nil {
			if err != io.EOF {
				log.Printf("Error reading length from %s: %v", peerID, err)
			}
			return
		}

		// Read message data
		data := make([]byte, length)
		if _, err := io.ReadFull(reader, data); err != nil {
			log.Printf("Error reading data from %s: %v", peerID, err)
			return
		}

		log.Printf("Received %d bytes via stream from %s", len(data), peerID)

		// Send to application via channel (NO MUTEX!)
		nm.eventCh <- NetworkEvent{
			Type: "message_received",
			From: localPeerID,
			Data: data,
		}
	}
}

// pubsubLoop listens for pubsub messages (broadcasts)
func (nm *NetworkManager) pubsubLoop() {
	for {
		select {
		case <-nm.shutdownCh:
			return
		default:
			msg, err := nm.sub.Next(nm.ctx)
			if err != nil {
				if err != context.Canceled {
					log.Printf("Pubsub error: %v", err)
				}
				return
			}

			// Ignore messages from ourselves
			if msg.ReceivedFrom == nm.host.ID() {
				continue
			}

			log.Printf("Received %d bytes via pubsub from %s", len(msg.Data), msg.ReceivedFrom)

			nm.eventCh <- NetworkEvent{
				Type: "message_received",
				From: PeerID(msg.ReceivedFrom.String()),
				Data: msg.Data,
			}
		}
	}
}

// commandLoop processes commands from the application
func (nm *NetworkManager) commandLoop() {
	for {
		select {
		case <-nm.shutdownCh:
			return
		case cmd := <-nm.commandCh:
			nm.handleCommand(cmd)
		}
	}
}

// handleCommand processes a single command
func (nm *NetworkManager) handleCommand(cmd NetworkCommand) {
	switch cmd.Type {
	case "connect":
		go nm.connectToPeer(cmd.Addr)
	case "send":
		nm.sendToPeer(cmd.To, cmd.Data)
	case "broadcast":
		nm.broadcast(cmd.Data)
	case "shutdown":
		nm.shutdown()
	}
}

// connectToPeer connects to a remote peer by multiaddr with retry logic
func (nm *NetworkManager) connectToPeer(addr string) {
	maddr, err := multiaddr.NewMultiaddr(addr)
	if err != nil {
		log.Printf("Invalid multiaddr %s: %v", addr, err)
		return
	}

	addrInfo, err := peer.AddrInfoFromP2pAddr(maddr)
	if err != nil {
		log.Printf("Failed to parse peer info from %s: %v", addr, err)
		return
	}

	// Wait a bit to let the target peer fully initialize
	time.Sleep(500 * time.Millisecond)

	// Retry logic
	maxRetries := 5
	for i := 0; i < maxRetries; i++ {
		log.Printf("Connecting to %s (attempt %d/%d)", addrInfo.ID, i+1, maxRetries)

		if err := nm.host.Connect(nm.ctx, *addrInfo); err != nil {
			log.Printf("Failed to connect to %s (attempt %d/%d): %v", addr, i+1, maxRetries, err)
			if i < maxRetries-1 {
				time.Sleep(time.Second * time.Duration(i+1)) // Exponential backoff
			}
		} else {
			log.Printf("Successfully connected to peer: %s", addrInfo.ID)
			return
		}
	}
	log.Printf("Gave up connecting to %s after %d attempts", addr, maxRetries)
}

// sendToPeer sends a message to a specific peer via stream
func (nm *NetworkManager) sendToPeer(localPeerID PeerID, data []byte) {
	nm.peersMux.RLock()
	peerID, ok := nm.peers[localPeerID]
	nm.peersMux.RUnlock()

	if !ok {
		log.Printf("Peer %s not found", localPeerID)
		return
	}

	// Open a new stream to the peer
	s, err := nm.host.NewStream(nm.ctx, peerID, protocol.ID(BlackTraceProtocolID))
	if err != nil {
		log.Printf("Failed to open stream to %s: %v", peerID, err)
		return
	}
	defer s.Close()

	writer := bufio.NewWriter(s)

	// Write length prefix
	length := uint32(len(data))
	if err := binary.Write(writer, binary.BigEndian, length); err != nil {
		log.Printf("Error writing length to %s: %v", peerID, err)
		return
	}

	// Write data
	if _, err := writer.Write(data); err != nil {
		log.Printf("Error writing data to %s: %v", peerID, err)
		return
	}

	// Flush
	if err := writer.Flush(); err != nil {
		log.Printf("Error flushing to %s: %v", peerID, err)
		return
	}

	log.Printf("Sent %d bytes via stream to %s", len(data), peerID)
}

// broadcast sends a message to all peers via pubsub
func (nm *NetworkManager) broadcast(data []byte) {
	if err := nm.topic.Publish(nm.ctx, data); err != nil {
		log.Printf("Failed to publish to topic: %v", err)
		return
	}

	log.Printf("Broadcast %d bytes via pubsub", len(data))
}

// shutdown cleanly shuts down the network manager
func (nm *NetworkManager) shutdown() {
	close(nm.shutdownCh)

	if nm.sub != nil {
		nm.sub.Cancel()
	}

	if nm.topic != nil {
		nm.topic.Close()
	}

	if nm.host != nil {
		nm.host.Close()
	}

	log.Println("Network manager shut down")
}

// PeerConnection represents a peer connection
type PeerConnection struct {
	ID   PeerID
	Addr string
}

// NodeStatus represents the node's status
type NodeStatus struct {
	PeerID     string
	ListenAddr string
	PeerCount  int
}

// GetPeers returns list of connected peers
func (nm *NetworkManager) GetPeers() []PeerConnection {
	nm.peersMux.RLock()
	defer nm.peersMux.RUnlock()

	peers := make([]PeerConnection, 0, len(nm.peers))
	for localID, p2pID := range nm.peers {
		// Get peer's addresses
		addrs := nm.host.Peerstore().Addrs(p2pID)
		addrStr := "unknown"
		if len(addrs) > 0 {
			addrStr = addrs[0].String()
		}

		peers = append(peers, PeerConnection{
			ID:   localID,
			Addr: addrStr,
		})
	}

	return peers
}

// GetStatus returns the node's current status
func (nm *NetworkManager) GetStatus() NodeStatus {
	nm.peersMux.RLock()
	peerCount := len(nm.peers)
	nm.peersMux.RUnlock()

	listenAddr := "unknown"
	if len(nm.host.Addrs()) > 0 {
		listenAddr = nm.host.Addrs()[0].String()
	}

	return NodeStatus{
		PeerID:     nm.host.ID().String(),
		ListenAddr: listenAddr,
		PeerCount:  peerCount,
	}
}
