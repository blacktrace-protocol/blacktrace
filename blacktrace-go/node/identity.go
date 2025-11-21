package node

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/crypto/pbkdf2"
)

// UserIdentity represents a user's identity with ECDSA keypair
type UserIdentity struct {
	Username         string    `json:"username"`
	PublicKeyX       []byte    `json:"public_key_x"`        // X coordinate of public key
	PublicKeyY       []byte    `json:"public_key_y"`        // Y coordinate of public key
	EncryptedPrivKey []byte    `json:"encrypted_priv_key"`  // Encrypted private key
	Salt             []byte    `json:"salt"`                 // Salt for key derivation
	CreatedAt        time.Time `json:"created_at"`
}

const (
	// PBKDF2 parameters
	pbkdf2Iterations = 100000
	keySize          = 32 // AES-256

	// Directory for storing identities
	identityDir = ".blacktrace/identities"
)

// GenerateIdentity creates a new user identity with ECDSA keypair
func GenerateIdentity(username, password string) (*UserIdentity, error) {
	if username == "" {
		return nil, fmt.Errorf("username cannot be empty")
	}
	if password == "" {
		return nil, fmt.Errorf("password cannot be empty")
	}

	// Generate ECDSA keypair using P-256 curve
	privKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("failed to generate keypair: %w", err)
	}

	// Generate random salt for password derivation
	salt := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, fmt.Errorf("failed to generate salt: %w", err)
	}

	// Derive encryption key from password using PBKDF2
	derivedKey := pbkdf2.Key([]byte(password), salt, pbkdf2Iterations, keySize, sha256.New)

	// Encrypt private key
	encryptedPrivKey, err := encryptPrivateKey(privKey, derivedKey)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt private key: %w", err)
	}

	// Create identity
	identity := &UserIdentity{
		Username:         username,
		PublicKeyX:       privKey.PublicKey.X.Bytes(),
		PublicKeyY:       privKey.PublicKey.Y.Bytes(),
		EncryptedPrivKey: encryptedPrivKey,
		Salt:             salt,
		CreatedAt:        time.Now(),
	}

	return identity, nil
}

// SaveIdentity saves an identity to disk
func SaveIdentity(identity *UserIdentity) error {
	// Get home directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	// Create identities directory if it doesn't exist
	identitiesPath := filepath.Join(homeDir, identityDir)
	if err := os.MkdirAll(identitiesPath, 0700); err != nil {
		return fmt.Errorf("failed to create identities directory: %w", err)
	}

	// Create identity file path
	identityFile := filepath.Join(identitiesPath, identity.Username+".json")

	// Check if identity already exists
	if _, err := os.Stat(identityFile); err == nil {
		return fmt.Errorf("identity for user %s already exists", identity.Username)
	}

	// Marshal identity to JSON
	data, err := json.MarshalIndent(identity, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal identity: %w", err)
	}

	// Write to file with restricted permissions
	if err := os.WriteFile(identityFile, data, 0600); err != nil {
		return fmt.Errorf("failed to write identity file: %w", err)
	}

	return nil
}

// LoadIdentity loads and decrypts a user identity
func LoadIdentity(username, password string) (*UserIdentity, *ecdsa.PrivateKey, error) {
	if username == "" {
		return nil, nil, fmt.Errorf("username cannot be empty")
	}
	if password == "" {
		return nil, nil, fmt.Errorf("password cannot be empty")
	}

	// Get home directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	// Create identity file path
	identityFile := filepath.Join(homeDir, identityDir, username+".json")

	// Read identity file
	data, err := os.ReadFile(identityFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil, fmt.Errorf("identity for user %s not found", username)
		}
		return nil, nil, fmt.Errorf("failed to read identity file: %w", err)
	}

	// Unmarshal identity
	var identity UserIdentity
	if err := json.Unmarshal(data, &identity); err != nil {
		return nil, nil, fmt.Errorf("failed to unmarshal identity: %w", err)
	}

	// Derive decryption key from password
	derivedKey := pbkdf2.Key([]byte(password), identity.Salt, pbkdf2Iterations, keySize, sha256.New)

	// Decrypt private key
	privKey, err := decryptPrivateKey(identity.EncryptedPrivKey, derivedKey)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to decrypt private key (wrong password?): %w", err)
	}

	return &identity, privKey, nil
}

// encryptPrivateKey encrypts a private key using AES-256-GCM
func encryptPrivateKey(privKey *ecdsa.PrivateKey, key []byte) ([]byte, error) {
	// Convert private key to bytes
	privKeyBytes := privKey.D.Bytes()

	// Create AES cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt and append nonce
	ciphertext := gcm.Seal(nonce, nonce, privKeyBytes, nil)
	return ciphertext, nil
}

// decryptPrivateKey decrypts a private key using AES-256-GCM
func decryptPrivateKey(encryptedKey, key []byte) (*ecdsa.PrivateKey, error) {
	// Create AES cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	// Extract nonce
	nonceSize := gcm.NonceSize()
	if len(encryptedKey) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := encryptedKey[:nonceSize], encryptedKey[nonceSize:]

	// Decrypt
	privKeyBytes, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption failed: %w", err)
	}

	// Reconstruct private key
	privKey := new(ecdsa.PrivateKey)
	privKey.PublicKey.Curve = elliptic.P256()
	privKey.D = new(big.Int).SetBytes(privKeyBytes)
	privKey.PublicKey.X, privKey.PublicKey.Y = privKey.PublicKey.Curve.ScalarBaseMult(privKeyBytes)

	return privKey, nil
}

// GetPublicKey returns the ECDSA public key from identity
func (id *UserIdentity) GetPublicKey() *ecdsa.PublicKey {
	pubKey := &ecdsa.PublicKey{
		Curve: elliptic.P256(),
		X:     new(big.Int).SetBytes(id.PublicKeyX),
		Y:     new(big.Int).SetBytes(id.PublicKeyY),
	}
	return pubKey
}

// IdentityExists checks if an identity exists for a username
func IdentityExists(username string) (bool, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return false, fmt.Errorf("failed to get home directory: %w", err)
	}

	identityFile := filepath.Join(homeDir, identityDir, username+".json")
	_, err = os.Stat(identityFile)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

// UserPublicKeyInfo contains public information about a user
type UserPublicKeyInfo struct {
	Username   string    `json:"username"`
	PublicKeyX []byte    `json:"public_key_x"`
	PublicKeyY []byte    `json:"public_key_y"`
	CreatedAt  time.Time `json:"created_at"`
}

// ListAllUsers returns a list of all registered usernames
func ListAllUsers() ([]string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	identitiesPath := filepath.Join(homeDir, identityDir)

	// Check if identities directory exists
	if _, err := os.Stat(identitiesPath); os.IsNotExist(err) {
		return []string{}, nil // No users registered yet
	}

	// Read all files in the identities directory
	entries, err := os.ReadDir(identitiesPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read identities directory: %w", err)
	}

	var usernames []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		// Extract username from filename (remove .json extension)
		filename := entry.Name()
		if filepath.Ext(filename) == ".json" {
			username := filename[:len(filename)-5] // Remove ".json"
			usernames = append(usernames, username)
		}
	}

	return usernames, nil
}

// GetUserPublicKey retrieves a user's public key without requiring password
func GetUserPublicKey(username string) (*UserPublicKeyInfo, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	identityFile := filepath.Join(homeDir, identityDir, username+".json")

	// Read identity file
	data, err := os.ReadFile(identityFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("user %s not found", username)
		}
		return nil, fmt.Errorf("failed to read identity file: %w", err)
	}

	// Unmarshal identity
	var identity UserIdentity
	if err := json.Unmarshal(data, &identity); err != nil {
		return nil, fmt.Errorf("failed to unmarshal identity: %w", err)
	}

	// Return public key info only
	return &UserPublicKeyInfo{
		Username:   identity.Username,
		PublicKeyX: identity.PublicKeyX,
		PublicKeyY: identity.PublicKeyY,
		CreatedAt:  identity.CreatedAt,
	}, nil
}

// ListAllUsersWithPublicKeys returns all registered users with their public keys
func ListAllUsersWithPublicKeys() ([]UserPublicKeyInfo, error) {
	usernames, err := ListAllUsers()
	if err != nil {
		return nil, err
	}

	var users []UserPublicKeyInfo
	for _, username := range usernames {
		userInfo, err := GetUserPublicKey(username)
		if err != nil {
			// Skip users with corrupted identity files
			continue
		}
		users = append(users, *userInfo)
	}

	return users, nil
}
