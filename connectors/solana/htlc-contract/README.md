# BlackTrace Solana HTLC Contract

Hash Time-Locked Contract (HTLC) for atomic swaps on Solana, compatible with Zcash HTLC scripts.

## Hash Algorithm

This contract uses **SHA256** for hash locks, matching the Zcash HTLC implementation:

```
Zcash:  RIPEMD160(SHA256(secret)) - but we use SHA256 portion for cross-chain compatibility
Solana: SHA256(secret)
```

For true atomic swaps, both chains verify the same secret pre-image.

## Contract Interface

### Instructions

#### `lock(hash_lock, receiver, amount, timeout)`
Lock SPL tokens in an HTLC escrow.

- `hash_lock`: 32-byte SHA256 hash of the secret
- `receiver`: Public key who can claim with the secret
- `amount`: Token amount to lock
- `timeout`: Unix timestamp for refund eligibility

#### `claim(hash_lock, secret)`
Claim locked tokens by revealing the secret.

- `hash_lock`: Identifies the HTLC
- `secret`: Pre-image that hashes to hash_lock

#### `refund(hash_lock)`
Refund tokens after timeout (sender only).

- `hash_lock`: Identifies the HTLC

### Events

- `Locked`: Emitted when tokens are locked
- `Claimed`: Emitted when tokens are claimed (includes revealed secret)
- `Refunded`: Emitted when tokens are refunded

## Building

```bash
# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Build the contract
anchor build

# Run tests
anchor test
```

## Deployment

```bash
# Deploy to localnet
anchor deploy

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## Account Structure

```
HTLCAccount (155 bytes):
  - hash_lock: [u8; 32]     // SHA256 hash
  - sender: Pubkey          // Who locked tokens
  - receiver: Pubkey        // Who can claim
  - token_mint: Pubkey      // SPL token mint
  - amount: u64             // Locked amount
  - timeout: i64            // Refund timestamp
  - claimed: bool           // Claim status
  - refunded: bool          // Refund status
  - bump: u8                // PDA bump
```

## PDA Seeds

- HTLC Account: `["htlc", hash_lock]`
- Token Vault: `["htlc_vault", hash_lock]`

## Cross-Chain Atomic Swap Flow

1. **Alice (Zcash)**: Creates secret, computes `hash = SHA256(secret)`
2. **Alice (Zcash)**: Locks ZEC with HTLC script using hash
3. **Bob (Solana)**: Sees hash on-chain, locks SPL tokens with same hash
4. **Alice (Solana)**: Claims SPL tokens by revealing secret
5. **Bob (Zcash)**: Uses revealed secret to claim ZEC

Both sides use SHA256, enabling true atomic settlement.
