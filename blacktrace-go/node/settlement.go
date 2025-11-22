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
	app     *BlackTraceApp // Reference to app for updating proposals
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
func NewSettlementManager(app *BlackTraceApp) (*SettlementManager, error) {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		log.Printf("Warning: NATS_URL not set, settlement service disabled")
		return &SettlementManager{enabled: false, app: app}, nil
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

	sm := &SettlementManager{
		nc:      nc,
		enabled: true,
		app:     app,
	}

	// Subscribe to settlement status updates
	if err := sm.subscribeToStatusUpdates(); err != nil {
		log.Printf("Warning: Failed to subscribe to settlement status updates: %v", err)
	}

	// Subscribe to secret reveals
	if err := sm.subscribeToSecretReveals(); err != nil {
		log.Printf("Warning: Failed to subscribe to settlement secrets: %v", err)
	}

	return sm, nil
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

// PublishSettlementStatusUpdate publishes a settlement status update to NATS
func (sm *SettlementManager) PublishSettlementStatusUpdate(update map[string]interface{}) error {
	if !sm.enabled {
		log.Printf("Settlement: Service disabled, skipping status update")
		return nil
	}

	// Marshal update to JSON
	data, err := json.Marshal(update)
	if err != nil {
		return fmt.Errorf("failed to marshal settlement status update: %w", err)
	}

	// Extract proposal ID for subject routing
	proposalID, ok := update["proposal_id"].(string)
	if !ok {
		return fmt.Errorf("proposal_id not found in status update")
	}

	// Publish to NATS subject for status updates
	subject := fmt.Sprintf("settlement.status.%s", proposalID)
	if err := sm.nc.Publish(subject, data); err != nil {
		return fmt.Errorf("failed to publish status update to NATS: %w", err)
	}

	status, _ := update["settlement_status"].(string)
	action, _ := update["action"].(string)
	log.Printf("Settlement: Published status update for proposal %s (status: %s, action: %s)",
		proposalID, status, action)

	return nil
}

// subscribeToStatusUpdates subscribes to settlement status updates from the settlement service
func (sm *SettlementManager) subscribeToStatusUpdates() error {
	_, err := sm.nc.Subscribe("settlement.status.*", func(msg *nats.Msg) {
		var update map[string]interface{}
		if err := json.Unmarshal(msg.Data, &update); err != nil {
			log.Printf("Settlement: Error parsing status update: %v", err)
			return
		}

		proposalID, ok := update["proposal_id"].(string)
		if !ok {
			return
		}

		status, _ := update["settlement_status"].(string)
		action, _ := update["action"].(string)

		log.Printf("Settlement: Received status update for %s: status=%s, action=%s", proposalID, status, action)

		// Update proposal in app's memory
		sm.app.proposalsMux.Lock()
		defer sm.app.proposalsMux.Unlock()

		if proposal, exists := sm.app.proposals[ProposalID(proposalID)]; exists {
			settlementStatus := SettlementStatus(status)
			proposal.SettlementStatus = &settlementStatus
			log.Printf("Settlement: Updated proposal %s settlement status to %s", proposalID, status)
		}
	})

	if err == nil {
		log.Printf("Settlement: Subscribed to status updates (settlement.status.*)")
	}
	return err
}

// subscribeToSecretReveals subscribes to HTLC secret reveals from the settlement service
func (sm *SettlementManager) subscribeToSecretReveals() error {
	_, err := sm.nc.Subscribe("settlement.secret.*", func(msg *nats.Msg) {
		var reveal map[string]interface{}
		if err := json.Unmarshal(msg.Data, &reveal); err != nil {
			log.Printf("Settlement: Error parsing secret reveal: %v", err)
			return
		}

		proposalID, _ := reveal["proposal_id"].(string)
		secret, _ := reveal["secret"].(string)
		hash, _ := reveal["hash"].(string)

		log.Printf("Settlement: 🔓 Received secret reveal for %s (hash: %s)", proposalID, hash)
		log.Printf("Settlement: Secret (hex): %s", secret)
		log.Printf("Settlement: Both assets locked - atomic swap ready!")
	})

	if err == nil {
		log.Printf("Settlement: Subscribed to secret reveals (settlement.secret.*)")
	}
	return err
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
