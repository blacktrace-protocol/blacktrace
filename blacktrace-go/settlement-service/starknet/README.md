# Starknet HTLC Client for Go

This package provides a Go client for interacting with the Starknet HTLC smart contract deployed on Starknet devnet.

## Features

- ✅ Read HTLC details (lock status, amounts, timeouts)
- ⏳ Lock STRK tokens (WIP - API compatibility issues)
- ⏳ Claim locked tokens (WIP - API compatibility issues)
- ⏳ Refund expired locks (WIP - API compatibility issues)

## Current Status

The read-only functionality (`GetHTLCDetails`) is implemented and working. The write functions (Lock, Claim, Refund) are pending due to API changes in starknet.go v0.17.0 that require further investigation.

## Usage

```go
import "github.com/blacktrace/settlement-service/starknet"

// Create client
client, err := starknet.NewHTLCClient(
    "http://localhost:5050",                                                    // RPC URL
    "0x0305b946a388e416709b20b49b4919de92bebbf363b23887e1d14da4593d6204",     // Contract address
    "0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691",     // Account address
    "0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9",     // Private key
)

// Get HTLC details
details, err := client.GetHTLCDetails(context.Background())
fmt.Printf("Amount locked: %s STRK\n", details.Amount.String())
fmt.Printf("Claimed: %v\n", details.Claimed)
```

## Testing

Run tests against the local devnet:

```bash
# Start devnet
docker-compose up -d starknet-devnet

# Run tests
go test -v ./starknet
```

## Next Steps

1. Fix write functions to work with starknet.go v0.17.0 API
2. Implement Pedersen hash computation for secret hashing
3. Add comprehensive integration tests
4. Integrate with settlement service for atomic swaps
