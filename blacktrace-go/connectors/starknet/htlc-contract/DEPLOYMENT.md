# Starknet HTLC Contract Deployment

## Contract Details

**Network**: Starknet Devnet (local)
**RPC URL**: http://localhost:5050

### Deployed Contract

- **Class Hash**: `0x585775febf7abfc204f6fe3c370ef3d69ac645b9d06d2902cc4d141b4935aa6`
- **Contract Address**: `0x0305b946a388e416709b20b49b4919de92bebbf363b23887e1d14da4593d6204`
- **Deployment TX**: `0x025c4d1e68cb1b26565741acd660f3c16aa1024978251a5fed83966ede495511`

### Test Account

- **Account Name**: devnet-account0
- **Address**: `0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691`
- **Public Key**: `0x039d9e6ce352ad4530a0ef5d5a18fd3303c3606a7fa6ac5b620020ad681cc33b`
- **Initial Balance**: 1000 STRK

## Contract Interface

### Functions

#### `lock(hash_lock: felt252, receiver: ContractAddress, timeout: u64, amount: u256)`
Lock STRK tokens in the HTLC contract.

**Parameters:**
- `hash_lock`: Pedersen hash of the secret (felt252)
- `receiver`: Address of the receiver who can claim with the secret
- `timeout`: Unix timestamp when the sender can refund
- `amount`: Amount of STRK to lock (u256)

#### `claim(secret: felt252)`
Claim the locked STRK by revealing the secret.

**Parameters:**
- `secret`: The preimage that hashes to `hash_lock`

**Requirements:**
- Must be called by the receiver
- Secret must hash to the stored hash_lock
- Timeout must not have passed

#### `refund()`
Refund the locked STRK back to the sender after timeout.

**Requirements:**
- Must be called by the sender
- Timeout must have passed
- HTLC must not already be claimed

#### `get_htlc_details() -> HTLCDetails`
Read-only function to get the current state of the HTLC.

**Returns:**
```rust
HTLCDetails {
    hash_lock: felt252,
    sender: ContractAddress,
    receiver: ContractAddress,
    amount: u256,
    timeout: u64,
    claimed: bool,
    refunded: bool,
}
```

## Test Results

### Lock Function Test
✅ Successfully locked 1000 STRK
- Transaction Hash: `0x07e178dcdde5543e31de9bbca04a4bf102152cfa96a4e0cd536472597528682d`
- Hash Lock: `0x4d5e2a36b64ec3e4b39e79b6a6ec1f3a2e3c1e8b5f9a2c1e8d5b9f2a3c1e8d5`
- Sender: `0x64b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691`
- Receiver: `0x78662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1`
- Amount: 1000
- Timeout: 1763916712
- Status: Locked (not claimed, not refunded)

## Usage Examples

### Using sncast

```bash
# Get HTLC details
sncast -a devnet-account0 call \
    --contract-address 0x0305b946a388e416709b20b49b4919de92bebbf363b23887e1d14da4593d6204 \
    --function get_htlc_details \
    --url http://localhost:5050

# Lock STRK
sncast -a devnet-account0 invoke \
    --contract-address 0x0305b946a388e416709b20b49b4919de92bebbf363b23887e1d14da4593d6204 \
    --function lock \
    --calldata <hash_lock> <receiver> <timeout> <amount_low> <amount_high> \
    --url http://localhost:5050

# Claim (as receiver)
sncast -a receiver-account invoke \
    --contract-address 0x0305b946a388e416709b20b49b4919de92bebbf363b23887e1d14da4593d6204 \
    --function claim \
    --calldata <secret> \
    --url http://localhost:5050

# Refund (as sender, after timeout)
sncast -a devnet-account0 invoke \
    --contract-address 0x0305b946a388e416709b20b49b4919de92bebbf363b23887e1d14da4593d6204 \
    --function refund \
    --url http://localhost:5050
```

## Build & Deploy

### Compile Contract
```bash
cd starknet-contracts
scarb build
```

### Declare Contract
```bash
sncast -a devnet-account0 declare \
    --contract-name HTLC \
    --url http://localhost:5050
```

### Deploy Contract
```bash
sncast -a devnet-account0 deploy \
    --class-hash <CLASS_HASH> \
    --url http://localhost:5050
```

## Integration Notes

For integration with the Go settlement service:
1. Use `starknet.go` library to interact with the contract
2. Coordinate secrets between ZEC and STRK HTLCs
3. Monitor contract events (Locked, Claimed, Refunded)
4. Handle timeout scenarios for refunds
