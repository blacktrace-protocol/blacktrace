# Chain Connector Architecture

BlackTrace is designed to support atomic swaps between any two blockchains. This document explains how to extend BlackTrace to support new chains beyond Zcash and Starknet.

## Overview

The **Chain Connector** is an interface that abstracts blockchain-specific operations. Each blockchain has its own connector implementation that handles:

- Wallet address creation
- Balance queries
- HTLC (Hash Time-Locked Contract) operations
- Transaction monitoring

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  BlackTrace Platform                     │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │   Orders   │  │ Proposals  │  │ Settlement │       │
│  │  Service   │  │  Service   │  │  Service   │       │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘       │
│        │                │                │              │
│        └────────────────┴────────────────┘              │
│                         │                               │
│              ┌──────────▼──────────┐                    │
│              │  Chain Connector    │                    │
│              │     Interface       │                    │
│              └──────────┬──────────┘                    │
│                         │                               │
│        ┌────────────────┼────────────────┐             │
│        │                │                │             │
│   ┌────▼────┐     ┌────▼────┐     ┌────▼────┐        │
│   │  Zcash  │     │Starknet │     │ Solana  │        │
│   │Connector│     │Connector│     │Connector│        │
│   └────┬────┘     └────┬────┘     └────┬────┘        │
└────────┼──────────────

─┼──────────────┼────────┘
         │                │                │
    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
    │  Zcash  │      │Starknet │      │ Solana  │
    │   RPC   │      │   RPC   │      │   RPC   │
    └─────────┘      └─────────┘      └─────────┘
```

## Chain Connector Interface

```go
type ChainConnector interface {
    // Wallet Operations
    CreateAddress() (address string, error)
    GetBalance(address string) (balance float64, error)
    FundAddress(address string, amount float64) (txid string, error) // For testing

    // HTLC Operations
    LockInHTLC(params HTLCLockParams) (lockTxid string, error)
    ClaimFromHTLC(params HTLCClaimParams) (claimTxid string, error)
    RefundFromHTLC(params HTLCRefundParams) (refundTxid string, error)

    // Monitoring
    GetHTLCStatus(lockTxid string) (status HTLCStatus, error)
    WaitForConfirmation(txid string, confirmations int) error

    // Chain Info
    GetChainID() string
    GetChainName() string
    GetNativeAsset() string
}

type HTLCLockParams struct {
    Amount      float64
    SecretHash  []byte    // SHA256 hash of secret
    Recipient   string    // Address that can claim with secret
    Timelock    int64     // Unix timestamp for refund
    Refundee    string    // Address that can refund after timelock
}

type HTLCClaimParams struct {
    LockTxid string
    Secret   []byte    // Preimage of secret hash
}

type HTLCRefundParams struct {
    LockTxid string
}

type HTLCStatus struct {
    Locked    bool
    Claimed   bool
    Refunded  bool
    Amount    float64
    Timelock  int64
}
```

## Existing Connectors

### 1. Zcash Connector

**Location:** `settlement-service/zcash/client.go`

**Features:**
- Transparent address support
- RPC-based HTLC (using raw transactions)
- Regtest/testnet support

**HTLC Implementation:**
- Creates 2-of-2 multisig with timelocks
- Uses OP_IF/OP_ELSE scripts for claim vs refund paths
- Secret revealed in scriptSig when claiming

### 2. Starknet Connector

**Location:** `settlement-service/starknet/connector.go`

**Features:**
- Cairo contract-based HTLC
- ERC-20 token support (STRK, USDC, etc.)
- Devnet/testnet support

**HTLC Implementation:**
- Smart contract with lock/claim/refund methods
- Secret hash stored in contract state
- ERC-20 approve + transfer pattern

## Adding a New Chain

### Example: Adding Solana Support

#### Step 1: Create Connector Implementation

Create `settlement-service/solana/connector.go`:

```go
package solana

import (
    "context"
    "github.com/gagliardetto/solana-go"
    "github.com/gagliardetto/solana-go/rpc"
)

type SolanaConnector struct {
    client     *rpc.Client
    keypair    solana.PrivateKey
    htlcProgram solana.PublicKey  // Your HTLC program address
}

func NewSolanaConnector(rpcURL string, keypair solana.PrivateKey, htlcProgram solana.PublicKey) *SolanaConnector {
    return &SolanaConnector{
        client:      rpc.New(rpcURL),
        keypair:     keypair,
        htlcProgram: htlcProgram,
    }
}

func (s *SolanaConnector) CreateAddress() (string, error) {
    // Generate new Solana keypair
    kp := solana.NewWallet()
    return kp.PublicKey().String(), nil
}

func (s *SolanaConnector) GetBalance(address string) (float64, error) {
    pubkey := solana.MustPublicKeyFromBase58(address)
    balance, err := s.client.GetBalance(
        context.Background(),
        pubkey,
        rpc.CommitmentFinalized,
    )
    if err != nil {
        return 0, err
    }
    return float64(balance.Value) / 1e9, nil  // Convert lamports to SOL
}

func (s *SolanaConnector) LockInHTLC(params HTLCLockParams) (string, error) {
    // 1. Create HTLC account
    // 2. Call HTLC program's "lock" instruction
    // 3. Transfer SOL/tokens to HTLC account
    // 4. Return transaction signature

    // Pseudocode:
    tx := solana.NewTransaction()
    tx.AddInstruction(
        CreateHTLCInstruction(
            s.htlcProgram,
            params.Amount,
            params.SecretHash,
            params.Recipient,
            params.Timelock,
        ),
    )

    sig, err := s.client.SendTransaction(context.Background(), tx)
    return sig.String(), err
}

func (s *SolanaConnector) ClaimFromHTLC(params HTLCClaimParams) (string, error) {
    // Call HTLC program's "claim" instruction with secret
    // Transfer funds from HTLC to recipient
    // Return transaction signature
}

func (s *SolanaConnector) RefundFromHTLC(params HTLCRefundParams) (string, error) {
    // Check timelock expired
    // Call HTLC program's "refund" instruction
    // Transfer funds back to refundee
}

func (s *SolanaConnector) GetHTLCStatus(lockTxid string) (HTLCStatus, error) {
    // Query HTLC account state
    // Return status
}

func (s *SolanaConnector) WaitForConfirmation(txid string, confirmations int) error {
    // Poll transaction status until confirmed
}

func (s *SolanaConnector) GetChainID() string { return "solana-mainnet" }
func (s *SolanaConnector) GetChainName() string { return "Solana" }
func (s *SolanaConnector) GetNativeAsset() string { return "SOL" }
```

#### Step 2: Create HTLC Program (Solana-specific)

Create `settlement-service/solana/htlc-program/src/lib.rs`:

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

declare_id!("Your_Program_ID_Here");

#[program]
pub mod htlc {
    use super::*;

    pub fn lock(
        ctx: Context<Lock>,
        amount: u64,
        secret_hash: [u8; 32],
        timelock: i64,
    ) -> Result<()> {
        let htlc = &mut ctx.accounts.htlc;
        htlc.amount = amount;
        htlc.secret_hash = secret_hash;
        htlc.recipient = ctx.accounts.recipient.key();
        htlc.refundee = ctx.accounts.refundee.key();
        htlc.timelock = timelock;
        htlc.locked = true;

        // Transfer SOL to HTLC PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.refundee.key(),
            &htlc.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[ctx.accounts.refundee.to_account_info(), htlc.to_account_info()],
        )?;

        Ok(())
    }

    pub fn claim(ctx: Context<Claim>, secret: [u8; 32]) -> Result<()> {
        let htlc = &ctx.accounts.htlc;

        // Verify secret hash
        let hash = hash(&secret).to_bytes();
        require!(hash == htlc.secret_hash, HTLCError::InvalidSecret);
        require!(htlc.locked, HTLCError::NotLocked);

        // Transfer SOL to recipient
        **htlc.to_account_info().try_borrow_mut_lamports()? -= htlc.amount;
        **ctx.accounts.recipient.try_borrow_mut_lamports()? += htlc.amount;

        let htlc = &mut ctx.accounts.htlc;
        htlc.locked = false;
        htlc.claimed = true;
        htlc.secret = Some(secret);

        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let htlc = &ctx.accounts.htlc;
        let clock = Clock::get()?;

        // Check timelock expired
        require!(clock.unix_timestamp >= htlc.timelock, HTLCError::TimelockNotExpired);
        require!(htlc.locked, HTLCError::NotLocked);

        // Transfer SOL back to refundee
        **htlc.to_account_info().try_borrow_mut_lamports()? -= htlc.amount;
        **ctx.accounts.refundee.try_borrow_mut_lamports()? += htlc.amount;

        let htlc = &mut ctx.accounts.htlc;
        htlc.locked = false;
        htlc.refunded = true;

        Ok(())
    }
}

#[account]
pub struct HTLC {
    pub amount: u64,
    pub secret_hash: [u8; 32],
    pub secret: Option<[u8; 32]>,
    pub recipient: Pubkey,
    pub refundee: Pubkey,
    pub timelock: i64,
    pub locked: bool,
    pub claimed: bool,
    pub refunded: bool,
}

#[error_code]
pub enum HTLCError {
    #[msg("Invalid secret provided")]
    InvalidSecret,
    #[msg("HTLC is not locked")]
    NotLocked,
    #[msg("Timelock has not expired yet")]
    TimelockNotExpired,
}
```

#### Step 3: Register Connector in Settlement Service

Update `settlement-service/main.go`:

```go
import (
    "blacktrace/settlement-service/zcash"
    "blacktrace/settlement-service/starknet"
    "blacktrace/settlement-service/solana"  // NEW
)

type SettlementService struct {
    // ... existing fields
    connectors map[string]ChainConnector
}

func NewSettlementService(...) (*SettlementService, error) {
    // ... existing code

    // Initialize connectors
    connectors := make(map[string]ChainConnector)

    // Zcash
    zcashClient := zcash.NewClient(zcashURL, zcashUser, zcashPassword)
    connectors["zcash"] = &ZcashConnector{client: zcashClient}

    // Starknet
    starknetClient := starknet.NewClient(starknetURL)
    connectors["starknet"] = starknet.NewConnector(starknetClient)

    // Solana (NEW)
    solanaClient := rpc.New(os.Getenv("SOLANA_RPC_URL"))
    solanaKeypair := loadSolanaKeypair()
    solanaHTLCProgram := solana.MustPublicKeyFromBase58(os.Getenv("SOLANA_HTLC_PROGRAM"))
    connectors["solana"] = solana.NewSolanaConnector(solanaClient, solanaKeypair, solanaHTLCProgram)

    return &SettlementService{
        connectors: connectors,
        // ...
    }, nil
}
```

#### Step 4: Update API Endpoints

The existing APIs already support chain parameter, so no changes needed:

```bash
# Create Solana wallet
curl -X POST http://localhost:8080/wallet/create \
  -d '{"session_id": "...", "chain": "solana"}'

# Lock SOL in HTLC
curl -X POST http://localhost:8080/settlement/{proposal_id}/lock \
  -d '{"session_id": "...", "side": "maker", "chain": "solana"}'
```

## Chain-Specific Considerations

### Zcash
- **Confirmations:** Need 1-2 confirmations (regtest) or 6+ (mainnet)
- **HTLC:** OP_IF/OP_ELSE script with hashlocks
- **Secret size:** 32 bytes (SHA256 preimage)

### Starknet
- **Confirmations:** Instant finality on L2
- **HTLC:** Cairo smart contract
- **Token support:** ERC-20 (STRK, USDC, etc.)
- **Secret size:** Felt252 (32 bytes)

### Solana
- **Confirmations:** "Finalized" commitment level (~32 slots)
- **HTLC:** Anchor program with PDA accounts
- **Token support:** SPL tokens
- **Secret size:** 32 bytes

### Ethereum/EVMs
- **Confirmations:** 12-15 blocks for safety
- **HTLC:** Solidity smart contract
- **Token support:** ERC-20
- **Secret size:** 32 bytes (bytes32 in Solidity)
- **Gas:** Need to account for variable gas costs

## Testing New Connectors

1. **Unit tests** - Test each method in isolation
2. **Integration tests** - Test full HTLC flow on testnet
3. **Cross-chain tests** - Test atomic swaps between chains
4. **Devnet/testnet** - Test on local/test networks first
5. **Mainnet** - Deploy only after thorough testing

## Configuration

Add chain configuration to `docker-compose.yml` or environment:

```yaml
environment:
  # Existing
  - ZCASH_RPC_URL=http://zcash-regtest:18232
  - STARKNET_RPC_URL=http://starknet-devnet:5050

  # New
  - SOLANA_RPC_URL=http://solana-test-validator:8899
  - SOLANA_HTLC_PROGRAM=YourProgramIDHere
  - SOLANA_KEYPAIR_PATH=/keys/solana-keypair.json
```

## Security Considerations

1. **Timelock duration:** Must be long enough for both parties to claim (e.g., 24 hours)
2. **Secret generation:** Use cryptographically secure random number generator
3. **Secret revelation:** Maker reveals secret when claiming, taker can then claim their side
4. **Refund safety:** Ensure timelock provides enough buffer for network delays
5. **Key management:** Securely store private keys for each chain

## Future Enhancements

- **Multi-hop swaps:** Chain A → Chain B → Chain C
- **Partial fills:** Split large orders across multiple swaps
- **Liquidity pools:** Automated market makers for instant swaps
- **Fee markets:** Dynamic pricing based on demand
- **Cross-chain messaging:** Use protocols like LayerZero, Wormhole for enhanced coordination

## Resources

- [HTLC Specification](https://en.bitcoin.it/wiki/Hash_Time_Locked_Contracts)
- [Atomic Swaps](https://en.bitcoin.it/wiki/Atomic_swap)
- [Lightning Network BOLTs](https://github.com/lightning/bolts) - HTLC best practices
