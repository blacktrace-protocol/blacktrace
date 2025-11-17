package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"syscall"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authentication commands",
	Long:  `Register, login, and manage user authentication.`,
}

var authRegisterCmd = &cobra.Command{
	Use:   "register",
	Short: "Register a new user identity",
	Long:  `Create a new user identity with encrypted keypair.`,
	Run:   runAuthRegister,
}

var authLoginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login to a node",
	Long:  `Authenticate with username and password to create a session.`,
	Run:   runAuthLogin,
}

var authLogoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Logout from current session",
	Long:  `Terminate the current session.`,
	Run:   runAuthLogout,
}

var authWhoamiCmd = &cobra.Command{
	Use:   "whoami",
	Short: "Show current session information",
	Long:  `Display information about the currently logged-in user.`,
	Run:   runAuthWhoami,
}

func init() {
	rootCmd.AddCommand(authCmd)
	authCmd.AddCommand(authRegisterCmd)
	authCmd.AddCommand(authLoginCmd)
	authCmd.AddCommand(authLogoutCmd)
	authCmd.AddCommand(authWhoamiCmd)
}

func runAuthRegister(cmd *cobra.Command, args []string) {
	fmt.Println("Register New User Identity")
	fmt.Println("==========================")
	fmt.Println()

	// Prompt for username
	fmt.Print("Username: ")
	var username string
	fmt.Scanln(&username)

	if username == "" {
		fmt.Println("Error: Username cannot be empty")
		return
	}

	// Prompt for password (hidden input)
	fmt.Print("Password: ")
	passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
	fmt.Println() // New line after password input
	if err != nil {
		fmt.Printf("Error reading password: %v\n", err)
		return
	}

	password := string(passwordBytes)
	if password == "" {
		fmt.Println("Error: Password cannot be empty")
		return
	}

	// Confirm password
	fmt.Print("Confirm Password: ")
	confirmBytes, err := term.ReadPassword(int(syscall.Stdin))
	fmt.Println()
	if err != nil {
		fmt.Printf("Error reading password: %v\n", err)
		return
	}

	if string(confirmBytes) != password {
		fmt.Println("Error: Passwords do not match")
		return
	}

	// Send registration request
	reqBody := map[string]string{
		"username": username,
		"password": password,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	resp, err := http.Post(apiURL+"/auth/register", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Printf("Error connecting to node: %v\n", err)
		fmt.Println("Make sure a node is running (./blacktrace node)")
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]string
		json.Unmarshal(body, &errResp)
		fmt.Printf("Error: %s\n", errResp["error"])
		return
	}

	fmt.Println()
	fmt.Printf("User '%s' registered successfully!\n", username)
	fmt.Println("You can now login with: ./blacktrace auth login")
}

func runAuthLogin(cmd *cobra.Command, args []string) {
	fmt.Println("Login to Node")
	fmt.Println("=============")
	fmt.Println()

	// Prompt for username
	fmt.Print("Username: ")
	var username string
	fmt.Scanln(&username)

	if username == "" {
		fmt.Println("Error: Username cannot be empty")
		return
	}

	// Prompt for password (hidden input)
	fmt.Print("Password: ")
	passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
	fmt.Println()
	if err != nil {
		fmt.Printf("Error reading password: %v\n", err)
		return
	}

	password := string(passwordBytes)
	if password == "" {
		fmt.Println("Error: Password cannot be empty")
		return
	}

	// Send login request
	reqBody := map[string]string{
		"username": username,
		"password": password,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	resp, err := http.Post(apiURL+"/auth/login", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Printf("Error connecting to node: %v\n", err)
		fmt.Println("Make sure a node is running (./blacktrace node)")
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]string
		json.Unmarshal(body, &errResp)
		fmt.Printf("Error: %s\n", errResp["error"])
		return
	}

	// Parse response
	var result struct {
		SessionID string `json:"session_id"`
		Username  string `json:"username"`
		ExpiresAt string `json:"expires_at"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Printf("Error parsing response: %v\n", err)
		return
	}

	// Save session to file for CLI persistence
	if err := saveSessionLocal(result.SessionID); err != nil {
		fmt.Printf("Warning: Failed to save session locally: %v\n", err)
		fmt.Printf("Session ID: %s\n", result.SessionID)
		fmt.Println("You will need to provide this session ID manually for subsequent commands")
		return
	}

	fmt.Println()
	fmt.Printf("Login successful!\n")
	fmt.Printf("Logged in as: %s\n", result.Username)
	fmt.Printf("Session expires: %s\n", result.ExpiresAt)
	fmt.Println()
	fmt.Println("You can now use order and negotiate commands")
}

func runAuthLogout(cmd *cobra.Command, args []string) {
	// Load session from file
	sessionID, _, err := loadSessionLocal()
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		fmt.Println("You are not logged in")
		return
	}

	// Send logout request
	reqBody := map[string]string{
		"session_id": sessionID,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	resp, err := http.Post(apiURL+"/auth/logout", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Printf("Error connecting to node: %v\n", err)
		return
	}
	defer resp.Body.Close()

	// Clear local session file
	if err := clearSessionLocal(); err != nil {
		fmt.Printf("Warning: Failed to clear local session: %v\n", err)
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		var errResp map[string]string
		json.Unmarshal(body, &errResp)
		fmt.Printf("Error: %s\n", errResp["error"])
		return
	}

	fmt.Println("Logged out successfully")
}

func runAuthWhoami(cmd *cobra.Command, args []string) {
	// Load session from file
	sessionID, savedAPIURL, err := loadSessionLocal()
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		fmt.Println("You are not logged in")
		return
	}

	// Send whoami request
	reqBody := map[string]string{
		"session_id": sessionID,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	resp, err := http.Post(apiURL+"/auth/whoami", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Printf("Error connecting to node: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]string
		json.Unmarshal(body, &errResp)
		fmt.Printf("Error: %s\n", errResp["error"])
		return
	}

	// Parse response
	var result struct {
		Username  string `json:"username"`
		SessionID string `json:"session_id"`
		LoggedInAt string `json:"logged_in_at"`
		ExpiresAt string `json:"expires_at"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Printf("Error parsing response: %v\n", err)
		return
	}

	fmt.Println("Current Session")
	fmt.Println("===============")
	fmt.Printf("Username: %s\n", result.Username)
	fmt.Printf("Session ID: %s\n", result.SessionID)
	fmt.Printf("API URL: %s\n", savedAPIURL)
	fmt.Printf("Logged in at: %s\n", result.LoggedInAt)
	fmt.Printf("Expires at: %s\n", result.ExpiresAt)
}

// Helper functions for local session management

func saveSessionLocal(sessionID string) error {
	homeDir, err := getHomeDir()
	if err != nil {
		return err
	}

	sessionDir := homeDir + "/.blacktrace"
	if err := createDir(sessionDir); err != nil {
		return err
	}

	sessionFile := sessionDir + "/session.json"

	sessionData := map[string]string{
		"session_id": sessionID,
		"api_url":    apiURL,
	}

	data, err := json.MarshalIndent(sessionData, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal session data: %w", err)
	}

	if err := writeFile(sessionFile, data); err != nil {
		return fmt.Errorf("failed to write session file: %w", err)
	}

	return nil
}

func loadSessionLocal() (string, string, error) {
	homeDir, err := getHomeDir()
	if err != nil {
		return "", "", err
	}

	sessionFile := homeDir + "/.blacktrace/session.json"

	data, err := readFile(sessionFile)
	if err != nil {
		return "", "", fmt.Errorf("no active session found. Please login first")
	}

	var sessionData map[string]string
	if err := json.Unmarshal(data, &sessionData); err != nil {
		return "", "", fmt.Errorf("failed to unmarshal session data: %w", err)
	}

	sessionID := sessionData["session_id"]
	savedAPIURL := sessionData["api_url"]

	if sessionID == "" {
		return "", "", fmt.Errorf("invalid session data")
	}

	return sessionID, savedAPIURL, nil
}

func clearSessionLocal() error {
	homeDir, err := getHomeDir()
	if err != nil {
		return err
	}

	sessionFile := homeDir + "/.blacktrace/session.json"
	return removeFile(sessionFile)
}

// File system helper functions

func getHomeDir() (string, error) {
	return os.UserHomeDir()
}

func createDir(path string) error {
	return os.MkdirAll(path, 0700)
}

func writeFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0600)
}

func readFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

func removeFile(path string) error {
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			return nil // Already removed
		}
		return err
	}
	return nil
}
