# Chain Connector Architecture

BlackTrace is designed to support atomic swaps between any two blockchains. This document explains the current chain connectors (Zcash, Solana, Starknet) and how to extend BlackTrace to support additional chains.

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

**Location:** `connectors/zcash/`

**Features:**
- Transparent address support (t-addresses)
- RPC-based HTLC using raw transactions
- HASH160 (RIPEMD160(SHA256(secret))) for hash locks
- Regtest/testnet/mainnet support

**HTLC Implementation:**
- Uses OP_IF/OP_ELSE scripts for claim vs refund paths
- P2SH address generation from HTLC script
- Secret revealed in scriptSig when claiming

### 2. Solana Connector

**Location:** `connectors/solana/`

**Features:**
- Anchor HTLC program (Rust)
- Native SOL support (lamports)
- HASH160 (20-byte) hash locks for Zcash compatibility
- Devnet/testnet/mainnet support

**HTLC Implementation:**
- Program ID: `CUxqXa849pvw3TLEWRrA2RyA3vm5SXXwb181BFnRSvej`
- PDA (Program Derived Address) accounts from hash_lock
- Lock/Claim/Refund instructions
- Frontend integration via `@solana/web3.js`

### 3. Starknet Connector

**Location:** `connectors/starknet/`

**Features:**
- Cairo contract-based HTLC
- STRK token support
- Devnet/testnet support

**HTLC Implementation:**
- Smart contract with lock/claim/refund methods
- Secret hash stored in contract state
- Native STRK transfers

## Adding a New Chain

### Example: Adding Ethereum Support

This example shows how to add a new chain connector. The pattern follows what was implemented for Solana.

#### Step 1: Create Connector Implementation

Create `connectors/ethereum/connector.go`:

```go
package ethereum

import (
    "context"
    "math/big"
    "github.com/ethereum/go-ethereum/ethclient"
    "github.com/ethereum/go-ethereum/common"
)

type EthereumConnector struct {
    client       *ethclient.Client
    htlcContract common.Address
}

func NewEthereumConnector(rpcURL string, htlcContract common.Address) (*EthereumConnector, error) {
    client, err := ethclient.Dial(rpcURL)
    if err != nil {
        return nil, err
    }
    return &EthereumConnector{
        client:       client,
        htlcContract: htlcContract,
    }, nil
}

func (e *EthereumConnector) GetBalance(address string) (float64, error) {
    addr := common.HexToAddress(address)
    balance, err := e.client.BalanceAt(context.Background(), addr, nil)
    if err != nil {
        return 0, err
    }
    // Convert wei to ETH
    ethBalance := new(big.Float).Quo(
        new(big.Float).SetInt(balance),
        big.NewFloat(1e18),
    )
    result, _ := ethBalance.Float64()
    return result, nil
}

func (e *EthereumConnector) LockInHTLC(params HTLCLockParams) (string, error) {
    // 1. Prepare transaction to call HTLC contract's lock() method
    // 2. Sign and send transaction
    // 3. Return transaction hash
}

func (e *EthereumConnector) ClaimFromHTLC(params HTLCClaimParams) (string, error) {
    // Call HTLC contract's claim() method with secret
}

func (e *EthereumConnector) RefundFromHTLC(params HTLCRefundParams) (string, error) {
    // Call HTLC contract's refund() method after timelock
}

func (e *EthereumConnector) GetChainID() string { return "ethereum-mainnet" }
func (e *EthereumConnector) GetChainName() string { return "Ethereum" }
func (e *EthereumConnector) GetNativeAsset() string { return "ETH" }
```

#### Step 2: Create HTLC Smart Contract (Solidity)

Create `connectors/ethereum/htlc-contract/HTLC.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract HTLC {
    struct Lock {
        address sender;
        address recipient;
        uint256 amount;
        bytes20 hashLock;  // HASH160 for Zcash compatibility
        uint256 timelock;
        bool claimed;
        bool refunded;
    }

    mapping(bytes20 => Lock) public locks;

    event Locked(bytes20 indexed hashLock, address sender, address recipient, uint256 amount, uint256 timelock);
    event Claimed(bytes20 indexed hashLock, bytes secret);
    event Refunded(bytes20 indexed hashLock);

    function lock(
        bytes20 hashLock,
        address recipient,
        uint256 timelock
    ) external payable {
        require(msg.value > 0, "Amount must be > 0");
        require(timelock > block.timestamp, "Timelock must be in future");
        require(locks[hashLock].amount == 0, "Lock already exists");

        locks[hashLock] = Lock({
            sender: msg.sender,
            recipient: recipient,
            amount: msg.value,
            hashLock: hashLock,
            timelock: timelock,
            claimed: false,
            refunded: false
        });

        emit Locked(hashLock, msg.sender, recipient, msg.value, timelock);
    }

    function claim(bytes20 hashLock, bytes calldata secret) external {
        Lock storage htlc = locks[hashLock];
        require(htlc.amount > 0, "Lock does not exist");
        require(!htlc.claimed, "Already claimed");
        require(!htlc.refunded, "Already refunded");

        // Verify HASH160(secret) matches hashLock
        bytes20 computed = ripemd160(abi.encodePacked(sha256(secret)));
        require(computed == hashLock, "Invalid secret");

        htlc.claimed = true;
        payable(htlc.recipient).transfer(htlc.amount);

        emit Claimed(hashLock, secret);
    }

    function refund(bytes20 hashLock) external {
        Lock storage htlc = locks[hashLock];
        require(htlc.amount > 0, "Lock does not exist");
        require(!htlc.claimed, "Already claimed");
        require(!htlc.refunded, "Already refunded");
        require(block.timestamp >= htlc.timelock, "Timelock not expired");
        require(msg.sender == htlc.sender, "Only sender can refund");

        htlc.refunded = true;
        payable(htlc.sender).transfer(htlc.amount);

        emit Refunded(hashLock);
    }
}
```

#### Step 3: Register Connector in Settlement Service

Update `services/settlement/main.go`:

```go
import (
    "blacktrace/connectors/zcash"
    "blacktrace/connectors/solana"
    "blacktrace/connectors/starknet"
    "blacktrace/connectors/ethereum"  // NEW
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

    // Solana
    connectors["solana"] = solana.NewConnector(solanaRPC, htlcProgramID)

    // Starknet
    connectors["starknet"] = starknet.NewConnector(starknetRPC)

    // Ethereum (NEW)
    ethConnector, _ := ethereum.NewEthereumConnector(
        os.Getenv("ETHEREUM_RPC_URL"),
        common.HexToAddress(os.Getenv("ETHEREUM_HTLC_CONTRACT")),
    )
    connectors["ethereum"] = ethConnector

    return &SettlementService{
        connectors: connectors,
        // ...
    }, nil
}
```

#### Step 4: Update API Endpoints

The existing APIs already support chain parameter, so no changes needed:

```bash
# Create Ethereum wallet
curl -X POST http://localhost:8080/wallet/create \
  -d '{"session_id": "...", "chain": "ethereum"}'

# Lock ETH in HTLC
curl -X POST http://localhost:8080/settlement/{proposal_id}/lock \
  -d '{"session_id": "...", "side": "maker", "chain": "ethereum"}'
```

## Chain-Specific Considerations

### Zcash
- **Confirmations:** Need 1-2 confirmations (regtest) or 6+ (mainnet)
- **HTLC:** OP_IF/OP_ELSE script with hashlocks
- **Secret size:** 32 bytes (SHA256 preimage)

### Starknet
- **Confirmations:** Instant finality on L2
- **HTLC:** Cairo smart contract
- **Token support:** STRK native token
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
  # Zcash
  - ZCASH_RPC_URL=http://zcash-regtest:18232
  - ZCASH_RPC_USER=blacktrace
  - ZCASH_RPC_PASSWORD=regtest123

  # Solana
  - SOLANA_RPC_URL=http://solana-devnet:8899
  - SOLANA_HTLC_PROGRAM=CUxqXa849pvw3TLEWRrA2RyA3vm5SXXwb181BFnRSvej

  # Starknet
  - STARKNET_RPC_URL=http://starknet-devnet:5050

  # Ethereum (example for new chain)
  - ETHEREUM_RPC_URL=http://localhost:8545
  - ETHEREUM_HTLC_CONTRACT=0x...
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
