package node

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/nats-io/nats.go"
)

// SettlementManager handles communication with the Rust settlement service via NATS
type SettlementManager struct {
	nc      *nats.Conn
	enabled bool
}

// SettlementRequest represents a request to initiate HTLC settlement
type SettlementRequest struct {
	ProposalID     string    `json:"proposal_id"`
	OrderID        string    `json:"order_id"`
	MakerID        string    `json:"maker_id"`
	TakerID        string    `json:"taker_id"`
	Amount         uint64    `json:"amount"`
	Price          uint64    `json:"price"`
	Stablecoin     string    `json:"stablecoin"`
	SettlementChain string   `json:"settlement_chain"` // "ztarknet", "solana", etc.
	Timestamp      time.Time `json:"timestamp"`
}

// NewSettlementManager creates a new settlement manager
func NewSettlementManager() (*SettlementManager, error) {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		log.Printf("Warning: NATS_URL not set, settlement service disabled")
		return &SettlementManager{enabled: false}, nil
	}

	// Connect to NATS
	nc, err := nats.Connect(natsURL,
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2*time.Second),
		nats.DisconnectErrHandler(func(nc *nats.Conn, err error) {
			if err != nil {
				log.Printf("NATS: Disconnected due to: %v", err)
			}
		}),
		nats.ReconnectHandler(func(nc *nats.Conn) {
			log.Printf("NATS: Reconnected to %v", nc.ConnectedUrl())
		}),
		nats.ClosedHandler(func(nc *nats.Conn) {
			log.Printf("NATS: Connection closed")
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	log.Printf("Settlement: Connected to NATS at %s", natsURL)

	return &SettlementManager{
		nc:      nc,
		enabled: true,
	}, nil
}

// PublishSettlementRequest publishes a settlement request to NATS
func (sm *SettlementManager) PublishSettlementRequest(req SettlementRequest) error {
	if !sm.enabled {
		log.Printf("Settlement: Service disabled, skipping request")
		return nil
	}

	// Marshal request to JSON
	data, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal settlement request: %w", err)
	}

	// Publish to NATS subject
	subject := fmt.Sprintf("settlement.request.%s", req.ProposalID)
	if err := sm.nc.Publish(subject, data); err != nil {
		return fmt.Errorf("failed to publish to NATS: %w", err)
	}

	log.Printf("Settlement: Published request for proposal %s (Chain: %s, Amount: %d, Price: $%d)",
		req.ProposalID, req.SettlementChain, req.Amount, req.Price)

	return nil
}

// Close closes the NATS connection
func (sm *SettlementManager) Close() {
	if sm.enabled && sm.nc != nil {
		sm.nc.Close()
		log.Printf("Settlement: NATS connection closed")
	}
}

// IsEnabled returns whether the settlement service is enabled
func (sm *SettlementManager) IsEnabled() bool {
	return sm.enabled
}
