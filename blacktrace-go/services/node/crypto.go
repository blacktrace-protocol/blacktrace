package node

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/asn1"
	"errors"
	"fmt"
	"io"
	"math/big"

	"golang.org/x/crypto/hkdf"
)

// CryptoManager handles ECIES encryption and ECDSA signatures
type CryptoManager struct {
	privateKey *ecdsa.PrivateKey
	publicKey  *ecdsa.PublicKey
}

// NewCryptoManager creates a new crypto manager with the given private key
func NewCryptoManager(privateKey *ecdsa.PrivateKey) *CryptoManager {
	return &CryptoManager{
		privateKey: privateKey,
		publicKey:  &privateKey.PublicKey,
	}
}

// GetPublicKey returns the public key in uncompressed format (65 bytes: 0x04 || X || Y)
func (cm *CryptoManager) GetPublicKey() []byte {
	return elliptic.Marshal(cm.publicKey.Curve, cm.publicKey.X, cm.publicKey.Y)
}

// ParsePublicKey parses a public key from bytes (uncompressed format)
func ParsePublicKey(pubKeyBytes []byte) (*ecdsa.PublicKey, error) {
	curve := elliptic.P256()
	x, y := elliptic.Unmarshal(curve, pubKeyBytes)
	if x == nil {
		return nil, errors.New("invalid public key")
	}
	return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
}

// ECDSA Signature Structure
type ECDSASignature struct {
	R, S *big.Int
}

// SignMessage signs a message using ECDSA
func (cm *CryptoManager) SignMessage(message []byte) ([]byte, error) {
	// Hash the message
	hash := sha256.Sum256(message)

	// Sign the hash
	r, s, err := ecdsa.Sign(rand.Reader, cm.privateKey, hash[:])
	if err != nil {
		return nil, fmt.Errorf("failed to sign message: %w", err)
	}

	// Encode signature as ASN.1 DER
	sig := ECDSASignature{R: r, S: s}
	sigBytes, err := asn1.Marshal(sig)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal signature: %w", err)
	}

	return sigBytes, nil
}

// VerifySignature verifies an ECDSA signature
func VerifySignature(publicKey *ecdsa.PublicKey, message []byte, signature []byte) error {
	// Hash the message
	hash := sha256.Sum256(message)

	// Parse signature
	var sig ECDSASignature
	_, err := asn1.Unmarshal(signature, &sig)
	if err != nil {
		return fmt.Errorf("failed to unmarshal signature: %w", err)
	}

	// Verify signature
	if !ecdsa.Verify(publicKey, hash[:], sig.R, sig.S) {
		return errors.New("signature verification failed")
	}

	return nil
}

// ECIES Encrypted Message Structure
type ECIESEncryptedMessage struct {
	EphemeralPublicKey []byte // 65 bytes (uncompressed public key)
	Nonce              []byte // 12 bytes (GCM nonce)
	Ciphertext         []byte // Variable length
	AuthTag            []byte // 16 bytes (GCM authentication tag)
}

// ECIESEncrypt encrypts a message using ECIES (Elliptic Curve Integrated Encryption Scheme)
func ECIESEncrypt(recipientPublicKey *ecdsa.PublicKey, plaintext []byte) (*ECIESEncryptedMessage, error) {
	// Step 1: Generate ephemeral keypair
	ephemeralPrivateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("failed to generate ephemeral key: %w", err)
	}

	// Step 2: Compute shared secret using ECDH
	sharedX, _ := recipientPublicKey.Curve.ScalarMult(
		recipientPublicKey.X,
		recipientPublicKey.Y,
		ephemeralPrivateKey.D.Bytes(),
	)
	sharedSecret := sharedX.Bytes()

	// Step 3: Derive encryption key using HKDF-SHA256
	encryptionKey := make([]byte, 32) // AES-256 requires 32 bytes
	kdf := hkdf.New(sha256.New, sharedSecret, nil, []byte("blacktrace-ecies"))
	if _, err := io.ReadFull(kdf, encryptionKey); err != nil {
		return nil, fmt.Errorf("failed to derive encryption key: %w", err)
	}

	// Step 4: Encrypt with AES-256-GCM
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate random nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt and authenticate
	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)

	// Split ciphertext and auth tag
	// GCM appends the 16-byte tag to the ciphertext
	tagSize := gcm.Overhead()
	if len(ciphertext) < tagSize {
		return nil, errors.New("ciphertext too short")
	}

	actualCiphertext := ciphertext[:len(ciphertext)-tagSize]
	authTag := ciphertext[len(ciphertext)-tagSize:]

	// Get ephemeral public key bytes
	ephemeralPubKeyBytes := elliptic.Marshal(
		ephemeralPrivateKey.PublicKey.Curve,
		ephemeralPrivateKey.PublicKey.X,
		ephemeralPrivateKey.PublicKey.Y,
	)

	return &ECIESEncryptedMessage{
		EphemeralPublicKey: ephemeralPubKeyBytes,
		Nonce:              nonce,
		Ciphertext:         actualCiphertext,
		AuthTag:            authTag,
	}, nil
}

// ECIESDecrypt decrypts a message using ECIES
func (cm *CryptoManager) ECIESDecrypt(encrypted *ECIESEncryptedMessage) ([]byte, error) {
	// Step 1: Parse ephemeral public key
	ephemeralPublicKey, err := ParsePublicKey(encrypted.EphemeralPublicKey)
	if err != nil {
		return nil, fmt.Errorf("failed to parse ephemeral public key: %w", err)
	}

	// Step 2: Compute shared secret using ECDH
	sharedX, _ := ephemeralPublicKey.Curve.ScalarMult(
		ephemeralPublicKey.X,
		ephemeralPublicKey.Y,
		cm.privateKey.D.Bytes(),
	)
	sharedSecret := sharedX.Bytes()

	// Step 3: Derive encryption key using HKDF-SHA256
	encryptionKey := make([]byte, 32)
	kdf := hkdf.New(sha256.New, sharedSecret, nil, []byte("blacktrace-ecies"))
	if _, err := io.ReadFull(kdf, encryptionKey); err != nil {
		return nil, fmt.Errorf("failed to derive encryption key: %w", err)
	}

	// Step 4: Decrypt with AES-256-GCM
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	// Reconstruct full ciphertext with tag
	ciphertextWithTag := append(encrypted.Ciphertext, encrypted.AuthTag...)

	// Decrypt and verify authentication tag
	plaintext, err := gcm.Open(nil, encrypted.Nonce, ciphertextWithTag, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption failed (invalid auth tag or corrupted data): %w", err)
	}

	return plaintext, nil
}

// SerializeECIESMessage serializes an ECIES encrypted message to bytes
func SerializeECIESMessage(msg *ECIESEncryptedMessage) []byte {
	// Format: [ephemeral_pub_key_len (2 bytes)] [ephemeral_pub_key] [nonce_len (1 byte)] [nonce] [ciphertext_len (4 bytes)] [ciphertext] [auth_tag (16 bytes)]
	result := make([]byte, 0, 2+len(msg.EphemeralPublicKey)+1+len(msg.Nonce)+4+len(msg.Ciphertext)+16)

	// Ephemeral public key length (2 bytes, should be 65)
	result = append(result, byte(len(msg.EphemeralPublicKey)>>8), byte(len(msg.EphemeralPublicKey)))
	result = append(result, msg.EphemeralPublicKey...)

	// Nonce length (1 byte, should be 12)
	result = append(result, byte(len(msg.Nonce)))
	result = append(result, msg.Nonce...)

	// Ciphertext length (4 bytes)
	ctLen := len(msg.Ciphertext)
	result = append(result, byte(ctLen>>24), byte(ctLen>>16), byte(ctLen>>8), byte(ctLen))
	result = append(result, msg.Ciphertext...)

	// Auth tag (always 16 bytes)
	result = append(result, msg.AuthTag...)

	return result
}

// DeserializeECIESMessage deserializes an ECIES encrypted message from bytes
func DeserializeECIESMessage(data []byte) (*ECIESEncryptedMessage, error) {
	if len(data) < 2+65+1+12+4+16 {
		return nil, errors.New("encrypted message too short")
	}

	offset := 0

	// Parse ephemeral public key length
	epkLen := int(data[offset])<<8 | int(data[offset+1])
	offset += 2

	if len(data) < offset+epkLen {
		return nil, errors.New("invalid ephemeral public key length")
	}

	ephemeralPubKey := data[offset : offset+epkLen]
	offset += epkLen

	// Parse nonce length
	nonceLen := int(data[offset])
	offset += 1

	if len(data) < offset+nonceLen {
		return nil, errors.New("invalid nonce length")
	}

	nonce := data[offset : offset+nonceLen]
	offset += nonceLen

	// Parse ciphertext length
	ctLen := int(data[offset])<<24 | int(data[offset+1])<<16 | int(data[offset+2])<<8 | int(data[offset+3])
	offset += 4

	if len(data) < offset+ctLen+16 {
		return nil, errors.New("invalid ciphertext length")
	}

	ciphertext := data[offset : offset+ctLen]
	offset += ctLen

	// Parse auth tag (last 16 bytes)
	authTag := data[offset : offset+16]

	return &ECIESEncryptedMessage{
		EphemeralPublicKey: ephemeralPubKey,
		Nonce:              nonce,
		Ciphertext:         ciphertext,
		AuthTag:            authTag,
	}, nil
}
