package node

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"testing"
)

func TestECDSASignAndVerify(t *testing.T) {
	// Generate a test keypair
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	cm := NewCryptoManager(privateKey)

	// Test message
	message := []byte("Hello, BlackTrace!")

	// Sign the message
	signature, err := cm.SignMessage(message)
	if err != nil {
		t.Fatalf("Failed to sign message: %v", err)
	}

	// Verify the signature
	err = VerifySignature(&privateKey.PublicKey, message, signature)
	if err != nil {
		t.Fatalf("Failed to verify signature: %v", err)
	}

	// Test with tampered message
	tamperedMessage := []byte("Hello, BlackTrace?")
	err = VerifySignature(&privateKey.PublicKey, tamperedMessage, signature)
	if err == nil {
		t.Fatal("Expected verification to fail for tampered message")
	}

	// Test with wrong key
	wrongKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	err = VerifySignature(&wrongKey.PublicKey, message, signature)
	if err == nil {
		t.Fatal("Expected verification to fail with wrong key")
	}
}

func TestECIESEncryptDecrypt(t *testing.T) {
	// Generate keypair for Bob (recipient)
	bobKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate Bob's key: %v", err)
	}

	bobCM := NewCryptoManager(bobKey)

	// Test message
	plaintext := []byte("Secret order details: 10000 ZEC at $450-$470")

	// Alice encrypts for Bob
	encrypted, err := ECIESEncrypt(&bobKey.PublicKey, plaintext)
	if err != nil {
		t.Fatalf("Failed to encrypt: %v", err)
	}

	// Verify encrypted message structure
	if len(encrypted.EphemeralPublicKey) != 65 {
		t.Errorf("Expected ephemeral public key length 65, got %d", len(encrypted.EphemeralPublicKey))
	}
	if len(encrypted.Nonce) != 12 {
		t.Errorf("Expected nonce length 12, got %d", len(encrypted.Nonce))
	}
	if len(encrypted.AuthTag) != 16 {
		t.Errorf("Expected auth tag length 16, got %d", len(encrypted.AuthTag))
	}
	if len(encrypted.Ciphertext) == 0 {
		t.Error("Ciphertext is empty")
	}

	// Bob decrypts
	decrypted, err := bobCM.ECIESDecrypt(encrypted)
	if err != nil {
		t.Fatalf("Failed to decrypt: %v", err)
	}

	// Verify decrypted message matches original
	if !bytes.Equal(decrypted, plaintext) {
		t.Errorf("Decrypted message doesn't match.\nExpected: %s\nGot: %s", plaintext, decrypted)
	}

	// Test with wrong key (should fail)
	wrongKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	wrongCM := NewCryptoManager(wrongKey)
	_, err = wrongCM.ECIESDecrypt(encrypted)
	if err == nil {
		t.Fatal("Expected decryption to fail with wrong key")
	}

	// Test with tampered ciphertext (should fail)
	tamperedEncrypted := &ECIESEncryptedMessage{
		EphemeralPublicKey: encrypted.EphemeralPublicKey,
		Nonce:              encrypted.Nonce,
		Ciphertext:         append([]byte{}, encrypted.Ciphertext...),
		AuthTag:            encrypted.AuthTag,
	}
	tamperedEncrypted.Ciphertext[0] ^= 0xFF // Flip bits
	_, err = bobCM.ECIESDecrypt(tamperedEncrypted)
	if err == nil {
		t.Fatal("Expected decryption to fail with tampered ciphertext")
	}

	// Test with tampered auth tag (should fail)
	tamperedTag := &ECIESEncryptedMessage{
		EphemeralPublicKey: encrypted.EphemeralPublicKey,
		Nonce:              encrypted.Nonce,
		Ciphertext:         encrypted.Ciphertext,
		AuthTag:            append([]byte{}, encrypted.AuthTag...),
	}
	tamperedTag.AuthTag[0] ^= 0xFF
	_, err = bobCM.ECIESDecrypt(tamperedTag)
	if err == nil {
		t.Fatal("Expected decryption to fail with tampered auth tag")
	}
}

func TestECIESSerializeDeserialize(t *testing.T) {
	// Generate keypair
	bobKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	plaintext := []byte("Test message for serialization")

	// Encrypt
	encrypted, err := ECIESEncrypt(&bobKey.PublicKey, plaintext)
	if err != nil {
		t.Fatalf("Failed to encrypt: %v", err)
	}

	// Serialize
	serialized := SerializeECIESMessage(encrypted)
	if len(serialized) == 0 {
		t.Fatal("Serialized message is empty")
	}

	// Deserialize
	deserialized, err := DeserializeECIESMessage(serialized)
	if err != nil {
		t.Fatalf("Failed to deserialize: %v", err)
	}

	// Verify fields match
	if !bytes.Equal(deserialized.EphemeralPublicKey, encrypted.EphemeralPublicKey) {
		t.Error("Ephemeral public key mismatch")
	}
	if !bytes.Equal(deserialized.Nonce, encrypted.Nonce) {
		t.Error("Nonce mismatch")
	}
	if !bytes.Equal(deserialized.Ciphertext, encrypted.Ciphertext) {
		t.Error("Ciphertext mismatch")
	}
	if !bytes.Equal(deserialized.AuthTag, encrypted.AuthTag) {
		t.Error("Auth tag mismatch")
	}

	// Verify decryption still works
	bobCM := NewCryptoManager(bobKey)
	decrypted, err := bobCM.ECIESDecrypt(deserialized)
	if err != nil {
		t.Fatalf("Failed to decrypt deserialized message: %v", err)
	}

	if !bytes.Equal(decrypted, plaintext) {
		t.Errorf("Decrypted message doesn't match original")
	}
}

func TestPublicKeySerializeDeserialize(t *testing.T) {
	// Generate keypair
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	cm := NewCryptoManager(privateKey)

	// Get public key bytes
	pubKeyBytes := cm.GetPublicKey()
	if len(pubKeyBytes) != 65 {
		t.Errorf("Expected public key length 65, got %d", len(pubKeyBytes))
	}
	if pubKeyBytes[0] != 0x04 {
		t.Errorf("Expected uncompressed format marker 0x04, got 0x%02x", pubKeyBytes[0])
	}

	// Parse public key
	parsedPubKey, err := ParsePublicKey(pubKeyBytes)
	if err != nil {
		t.Fatalf("Failed to parse public key: %v", err)
	}

	// Verify it matches original
	if parsedPubKey.X.Cmp(privateKey.PublicKey.X) != 0 {
		t.Error("Public key X coordinate mismatch")
	}
	if parsedPubKey.Y.Cmp(privateKey.PublicKey.Y) != 0 {
		t.Error("Public key Y coordinate mismatch")
	}

	// Test with invalid data
	_, err = ParsePublicKey([]byte{0x00, 0x01, 0x02})
	if err == nil {
		t.Fatal("Expected error parsing invalid public key")
	}
}

func TestECIESForwardSecrecy(t *testing.T) {
	// Generate Bob's keypair
	bobKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	plaintext := []byte("Secret message")

	// Encrypt same message twice
	encrypted1, err := ECIESEncrypt(&bobKey.PublicKey, plaintext)
	if err != nil {
		t.Fatalf("Failed to encrypt message 1: %v", err)
	}

	encrypted2, err := ECIESEncrypt(&bobKey.PublicKey, plaintext)
	if err != nil {
		t.Fatalf("Failed to encrypt message 2: %v", err)
	}

	// Ephemeral keys should be different (forward secrecy)
	if bytes.Equal(encrypted1.EphemeralPublicKey, encrypted2.EphemeralPublicKey) {
		t.Error("Ephemeral public keys are identical (forward secrecy violated)")
	}

	// Ciphertexts should be different
	if bytes.Equal(encrypted1.Ciphertext, encrypted2.Ciphertext) {
		t.Error("Ciphertexts are identical (no randomness)")
	}

	// Both should decrypt correctly
	bobCM := NewCryptoManager(bobKey)

	decrypted1, err := bobCM.ECIESDecrypt(encrypted1)
	if err != nil {
		t.Fatalf("Failed to decrypt message 1: %v", err)
	}

	decrypted2, err := bobCM.ECIESDecrypt(encrypted2)
	if err != nil {
		t.Fatalf("Failed to decrypt message 2: %v", err)
	}

	if !bytes.Equal(decrypted1, plaintext) || !bytes.Equal(decrypted2, plaintext) {
		t.Error("Decrypted messages don't match original")
	}
}

func BenchmarkECDSASign(b *testing.B) {
	privateKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	cm := NewCryptoManager(privateKey)
	message := []byte("Benchmark message for ECDSA signing")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = cm.SignMessage(message)
	}
}

func BenchmarkECDSAVerify(b *testing.B) {
	privateKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	cm := NewCryptoManager(privateKey)
	message := []byte("Benchmark message for ECDSA verification")
	signature, _ := cm.SignMessage(message)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = VerifySignature(&privateKey.PublicKey, message, signature)
	}
}

func BenchmarkECIESEncrypt(b *testing.B) {
	recipientKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	plaintext := []byte("Benchmark plaintext for ECIES encryption performance testing")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = ECIESEncrypt(&recipientKey.PublicKey, plaintext)
	}
}

func BenchmarkECIESDecrypt(b *testing.B) {
	recipientKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	cm := NewCryptoManager(recipientKey)
	plaintext := []byte("Benchmark plaintext for ECIES decryption performance testing")
	encrypted, _ := ECIESEncrypt(&recipientKey.PublicKey, plaintext)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = cm.ECIESDecrypt(encrypted)
	}
}
