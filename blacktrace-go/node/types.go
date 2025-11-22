package node

import (
	"encoding/json"
	"fmt"
	"time"
)

// OrderID uniquely identifies an order
type OrderID string

// PeerID uniquely identifies a peer
type PeerID string

// ProposalID uniquely identifies a proposal
type ProposalID string

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

// ProposalStatus represents the state of a proposal
type ProposalStatus string

const (
	ProposalStatusPending  ProposalStatus = "Pending"
	ProposalStatusAccepted ProposalStatus = "Accepted"
	ProposalStatusRejected ProposalStatus = "Rejected"
)

// SettlementStatus represents the settlement state of an accepted proposal
type SettlementStatus string

const (
	SettlementStatusReady       SettlementStatus = "ready"        // Accepted, ready for Alice to lock
	SettlementStatusAliceLocked SettlementStatus = "alice_locked" // Alice has locked ZEC
	SettlementStatusBobLocked   SettlementStatus = "bob_locked"   // Bob has locked USDC (intermediate state)
	SettlementStatusBothLocked  SettlementStatus = "both_locked"  // Both assets locked, ready for claiming
	SettlementStatusClaiming    SettlementStatus = "claiming"     // Claim process initiated
	SettlementStatusComplete    SettlementStatus = "complete"     // Settlement complete
)

// OrderAnnouncement is broadcast when an order is created
type OrderAnnouncement struct {
	OrderID          OrderID        `json:"order_id"`
	OrderType        OrderType      `json:"order_type"`
	Stablecoin       StablecoinType `json:"stablecoin"`
	MakerID          PeerID         `json:"maker_id"` // NEW: Needed to send encrypted proposals
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

// EncryptedOrderDetailsMessage sent via direct stream to interested takers
type EncryptedOrderDetailsMessage struct {
	OrderID          OrderID `json:"order_id"`
	EncryptedPayload []byte  `json:"encrypted_payload"` // ECIES encrypted OrderDetails
}

// EncryptedProposalMessage sent via direct stream to maker (prevents frontrunning)
type EncryptedProposalMessage struct {
	OrderID          OrderID `json:"order_id"`
	EncryptedPayload []byte  `json:"encrypted_payload"` // ECIES encrypted Proposal
}

// EncryptedAcceptanceMessage sent via direct stream to proposer (prevents value leakage)
type EncryptedAcceptanceMessage struct {
	ProposalID       ProposalID `json:"proposal_id"`
	EncryptedPayload []byte     `json:"encrypted_payload"` // ECIES encrypted acceptance details
}

// Proposal during price negotiation
type Proposal struct {
	ProposalID       ProposalID        `json:"proposal_id"`
	OrderID          OrderID           `json:"order_id"`
	Price            uint64            `json:"price"`
	Amount           uint64            `json:"amount"`
	ProposerID       PeerID            `json:"proposer_id"`
	Status           ProposalStatus    `json:"status"`
	SettlementStatus *SettlementStatus `json:"settlement_status,omitempty"` // Only set when Status is Accepted
	Timestamp        time.Time         `json:"timestamp"`
}

// Message is the wire protocol envelope
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// SignedMessage wraps any message with ECDSA signature
type SignedMessage struct {
	Type            string          `json:"type"`
	Payload         json.RawMessage `json:"payload"`
	Signature       []byte          `json:"signature"`        // ECDSA signature over (type + payload)
	SignerPublicKey []byte          `json:"signer_public_key"` // 65-byte uncompressed public key
	Timestamp       int64           `json:"timestamp"`        // Unix timestamp
}

// NewOrderID generates a new order ID
func NewOrderID() OrderID {
	return OrderID(fmt.Sprintf("order_%d", time.Now().Unix()))
}

// NewProposalID generates a new proposal ID
func NewProposalID(orderID OrderID) ProposalID {
	return ProposalID(fmt.Sprintf("%s_proposal_%d", orderID, time.Now().UnixNano()))
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

// MarshalSignedMessage creates and signs a message
func MarshalSignedMessage(msgType string, payload interface{}, cm *CryptoManager) ([]byte, error) {
	// Marshal payload
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create message to sign (type + payload)
	messageToSign := append([]byte(msgType), payloadBytes...)

	// Sign the message
	signature, err := cm.SignMessage(messageToSign)
	if err != nil {
		return nil, fmt.Errorf("failed to sign message: %w", err)
	}

	// Create signed message
	signedMsg := SignedMessage{
		Type:            msgType,
		Payload:         payloadBytes,
		Signature:       signature,
		SignerPublicKey: cm.GetPublicKey(),
		Timestamp:       time.Now().Unix(),
	}

	// Marshal signed message
	return json.Marshal(signedMsg)
}

// UnmarshalSignedMessage parses and verifies a signed message
func UnmarshalSignedMessage(data []byte) (*SignedMessage, error) {
	var msg SignedMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal signed message: %w", err)
	}

	// Parse signer's public key
	signerPubKey, err := ParsePublicKey(msg.SignerPublicKey)
	if err != nil {
		return nil, fmt.Errorf("failed to parse signer public key: %w", err)
	}

	// Reconstruct message that was signed
	messageToVerify := append([]byte(msg.Type), msg.Payload...)

	// Verify signature
	if err := VerifySignature(signerPubKey, messageToVerify, msg.Signature); err != nil {
		return nil, fmt.Errorf("signature verification failed: %w", err)
	}

	return &msg, nil
}
