package node

import (
	"crypto/ecdsa"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// AuthSession represents an active user session
type AuthSession struct {
	SessionID  string
	Username   string
	Identity   *UserIdentity
	PrivateKey *ecdsa.PrivateKey
	LoggedInAt time.Time
	ExpiresAt  time.Time
}

// AuthManager manages user authentication and sessions
type AuthManager struct {
	sessions   map[string]*AuthSession
	mu         sync.RWMutex
	expiration time.Duration
}

// NewAuthManager creates a new authentication manager
func NewAuthManager(sessionExpiration time.Duration) *AuthManager {
	if sessionExpiration == 0 {
		sessionExpiration = 24 * time.Hour // Default: 24 hours
	}

	am := &AuthManager{
		sessions:   make(map[string]*AuthSession),
		expiration: sessionExpiration,
	}

	// Start cleanup goroutine for expired sessions
	go am.cleanupExpiredSessions()

	return am
}

// Register creates a new user identity
func (am *AuthManager) Register(username, password string) error {
	// Check if identity already exists
	exists, err := IdentityExists(username)
	if err != nil {
		return fmt.Errorf("failed to check if identity exists: %w", err)
	}
	if exists {
		return fmt.Errorf("user %s already exists", username)
	}

	// Generate new identity
	identity, err := GenerateIdentity(username, password)
	if err != nil {
		return fmt.Errorf("failed to generate identity: %w", err)
	}

	// Save identity to disk
	if err := SaveIdentity(identity); err != nil {
		return fmt.Errorf("failed to save identity: %w", err)
	}

	log.Printf("Auth: Registered new user: %s", username)
	return nil
}

// DeleteUser removes a user identity (used for rollback during registration failures)
func (am *AuthManager) DeleteUser(username string) error {
	// Delete from disk
	if err := DeleteIdentity(username); err != nil {
		return fmt.Errorf("failed to delete identity: %w", err)
	}

	// Remove any active sessions for this user
	am.mu.Lock()
	defer am.mu.Unlock()

	for sessionID, session := range am.sessions {
		if session.Username == username {
			delete(am.sessions, sessionID)
		}
	}

	log.Printf("Auth: Deleted user: %s", username)
	return nil
}

// Login authenticates a user and creates a session
func (am *AuthManager) Login(username, password string) (string, error) {
	// Load and decrypt identity
	identity, privKey, err := LoadIdentity(username, password)
	if err != nil {
		return "", fmt.Errorf("authentication failed: %w", err)
	}

	// Check if user already has an active session
	am.mu.Lock()
	defer am.mu.Unlock()

	for sessionID, session := range am.sessions {
		if session.Username == username && time.Now().Before(session.ExpiresAt) {
			// User already has active session, return existing session ID
			log.Printf("Auth: User %s already has active session: %s", username, sessionID)
			return sessionID, nil
		}
	}

	// Generate session ID
	sessionID, err := generateSessionID()
	if err != nil {
		return "", fmt.Errorf("failed to generate session ID: %w", err)
	}

	// Create session
	now := time.Now()
	session := &AuthSession{
		SessionID:  sessionID,
		Username:   username,
		Identity:   identity,
		PrivateKey: privKey,
		LoggedInAt: now,
		ExpiresAt:  now.Add(am.expiration),
	}

	am.sessions[sessionID] = session

	log.Printf("Auth: User %s logged in (session: %s, expires: %s)",
		username, sessionID, session.ExpiresAt.Format(time.RFC3339))

	return sessionID, nil
}

// Logout terminates a user session
func (am *AuthManager) Logout(sessionID string) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	session, ok := am.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session not found")
	}

	username := session.Username
	delete(am.sessions, sessionID)

	log.Printf("Auth: User %s logged out (session: %s)", username, sessionID)
	return nil
}

// RequireAuth validates a session and returns the associated identity and private key
func (am *AuthManager) RequireAuth(sessionID string) (*UserIdentity, *ecdsa.PrivateKey, error) {
	if sessionID == "" {
		return nil, nil, fmt.Errorf("no session ID provided")
	}

	am.mu.RLock()
	defer am.mu.RUnlock()

	session, ok := am.sessions[sessionID]
	if !ok {
		return nil, nil, fmt.Errorf("invalid session")
	}

	// Check if session has expired
	if time.Now().After(session.ExpiresAt) {
		return nil, nil, fmt.Errorf("session expired")
	}

	return session.Identity, session.PrivateKey, nil
}

// GetSession returns session information without requiring authentication
func (am *AuthManager) GetSession(sessionID string) (*AuthSession, error) {
	am.mu.RLock()
	defer am.mu.RUnlock()

	session, ok := am.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("session not found")
	}

	// Check if session has expired
	if time.Now().After(session.ExpiresAt) {
		return nil, fmt.Errorf("session expired")
	}

	return session, nil
}

// ListActiveSessions returns all active sessions (for debugging)
func (am *AuthManager) ListActiveSessions() []string {
	am.mu.RLock()
	defer am.mu.RUnlock()

	now := time.Now()
	activeSessions := make([]string, 0)

	for sessionID, session := range am.sessions {
		if now.Before(session.ExpiresAt) {
			activeSessions = append(activeSessions,
				fmt.Sprintf("%s (user: %s, expires: %s)",
					sessionID, session.Username, session.ExpiresAt.Format(time.RFC3339)))
		}
	}

	return activeSessions
}

// cleanupExpiredSessions periodically removes expired sessions
func (am *AuthManager) cleanupExpiredSessions() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		am.mu.Lock()
		now := time.Now()
		expiredCount := 0

		for sessionID, session := range am.sessions {
			if now.After(session.ExpiresAt) {
				delete(am.sessions, sessionID)
				expiredCount++
			}
		}

		if expiredCount > 0 {
			log.Printf("Auth: Cleaned up %d expired sessions", expiredCount)
		}
		am.mu.Unlock()
	}
}

// generateSessionID generates a random session ID
func generateSessionID() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// SaveSessionToFile saves a session ID to a file for CLI persistence
func SaveSessionToFile(sessionID, apiURL string) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	sessionDir := filepath.Join(homeDir, ".blacktrace")
	if err := os.MkdirAll(sessionDir, 0700); err != nil {
		return fmt.Errorf("failed to create session directory: %w", err)
	}

	sessionFile := filepath.Join(sessionDir, "session.json")

	sessionData := map[string]string{
		"session_id": sessionID,
		"api_url":    apiURL,
		"timestamp":  time.Now().Format(time.RFC3339),
	}

	data, err := json.MarshalIndent(sessionData, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal session data: %w", err)
	}

	if err := os.WriteFile(sessionFile, data, 0600); err != nil {
		return fmt.Errorf("failed to write session file: %w", err)
	}

	return nil
}

// LoadSessionFromFile loads a session ID from file for CLI persistence
func LoadSessionFromFile() (string, string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", "", fmt.Errorf("failed to get home directory: %w", err)
	}

	sessionFile := filepath.Join(homeDir, ".blacktrace", "session.json")

	data, err := os.ReadFile(sessionFile)
	if err != nil {
		if os.IsNotExist(err) {
			return "", "", fmt.Errorf("no active session found. Please login first")
		}
		return "", "", fmt.Errorf("failed to read session file: %w", err)
	}

	var sessionData map[string]string
	if err := json.Unmarshal(data, &sessionData); err != nil {
		return "", "", fmt.Errorf("failed to unmarshal session data: %w", err)
	}

	sessionID := sessionData["session_id"]
	apiURL := sessionData["api_url"]

	if sessionID == "" {
		return "", "", fmt.Errorf("invalid session data")
	}

	return sessionID, apiURL, nil
}

// ClearSessionFile removes the session file
func ClearSessionFile() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	sessionFile := filepath.Join(homeDir, ".blacktrace", "session.json")

	if err := os.Remove(sessionFile); err != nil {
		if os.IsNotExist(err) {
			return nil // Already cleared
		}
		return fmt.Errorf("failed to remove session file: %w", err)
	}

	return nil
}
