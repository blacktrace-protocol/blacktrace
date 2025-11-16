package main

import (
	"encoding/json"
	"fmt"
	"time"
)

// OrderID uniquely identifies an order
type OrderID string

// PeerID uniquely identifies a peer
type PeerID string

// OrderType represents buy or sell
type OrderType string

const (
	OrderTypeBuy  OrderType = "Buy"
	OrderTypeSell OrderType = "Sell"
)

// StablecoinType represents the stablecoin
type StablecoinType string

const (
	StablecoinUSDC StablecoinType = "USDC"
	StablecoinUSDT StablecoinType = "USDT"
	StablecoinDAI  StablecoinType = "DAI"
)

// OrderAnnouncement is broadcast when an order is created
type OrderAnnouncement struct {
	OrderID          OrderID        `json:"order_id"`
	OrderType        OrderType      `json:"order_type"`
	Stablecoin       StablecoinType `json:"stablecoin"`
	EncryptedDetails []byte         `json:"encrypted_details"`
	ProofCommitment  []byte         `json:"proof_commitment"`
	Timestamp        int64          `json:"timestamp"`
	Expiry           int64          `json:"expiry"`
}

// OrderDetails revealed during negotiation
type OrderDetails struct {
	OrderID    OrderID        `json:"order_id"`
	OrderType  OrderType      `json:"order_type"`
	Amount     uint64         `json:"amount"`
	MinPrice   uint64         `json:"min_price"`
	MaxPrice   uint64         `json:"max_price"`
	Stablecoin StablecoinType `json:"stablecoin"`
}

// Proposal during price negotiation
type Proposal struct {
	OrderID   OrderID   `json:"order_id"`
	Price     uint64    `json:"price"`
	Amount    uint64    `json:"amount"`
	Proposer  string    `json:"proposer"` // "Maker" or "Taker"
	Timestamp time.Time `json:"timestamp"`
}

// Message is the wire protocol envelope
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// NewOrderID generates a new order ID
func NewOrderID() OrderID {
	return OrderID(fmt.Sprintf("order_%d", time.Now().Unix()))
}

// MarshalMessage creates a wire protocol message
func MarshalMessage(msgType string, payload interface{}) ([]byte, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	msg := Message{
		Type:    msgType,
		Payload: payloadBytes,
	}

	return json.Marshal(msg)
}

// UnmarshalMessage parses a wire protocol message
func UnmarshalMessage(data []byte) (*Message, error) {
	var msg Message
	err := json.Unmarshal(data, &msg)
	return &msg, err
}
