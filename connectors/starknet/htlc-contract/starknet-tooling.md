# Starknet Tooling Compatibility Guide

This document captures the compatible versions of Starknet development tools that work together for deploying and interacting with the HTLC contract.

## Working Tool Versions (Tested)

| Tool | Version | Notes |
|------|---------|-------|
| **starknet-devnet-rs** | `0.1.2` | Docker image: `shardlabs/starknet-devnet-rs:0.1.2` |
| **starkli** | `0.3.5` | Install via `starkliup -v 0.3.5` |
| **scarb** | `2.6.4` | Cairo package manager |
| **cairo** | `2.6.3` | Comes with Scarb |
| **sierra** | `1.5.0` | Comes with Scarb |

## Version Compatibility Matrix

### What Works Together

```
starknet-devnet-rs 0.1.2  +  starkli 0.3.5  +  scarb 2.6.4
```

### What DOES NOT Work

| Devnet Version | Issue |
|----------------|-------|
| `0.0.4` | Sierra 1.5.0 contracts incompatible (expects Sierra 1.4.0) |
| `0.0.6` | Same Sierra version issue |
| `0.0.7` | `--host` argument already in entrypoint, causes duplicate |
| `0.2.4` | RPC spec 0.7.1, starkli expects 0.8.1 |
| `latest` | Changes frequently, avoid for reproducibility |

| starkli Version | Issue |
|-----------------|-------|
| `0.2.9` | JSON-RPC block ID format mismatch |
| `0.4.2` | Too new for most devnet versions |

| sncast Version | Issue |
|----------------|-------|
| `0.52.0` | RPC spec mismatch (`pre_confirmed` block ID not supported) |

## Docker Compose Configuration

The working configuration for `docker-compose.blockchains.yml`:

```yaml
starknet-devnet:
  image: shardlabs/starknet-devnet-rs:0.1.2
  container_name: blacktrace-starknet-devnet
  ports:
    - "5050:5050"
  networks:
    - blacktrace-net
  command: ["--seed", "0", "--accounts", "10", "--initial-balance", "1000000000000000000000"]
  healthcheck:
    test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:5050/is_alive"]
    interval: 5s
    timeout: 3s
    retries: 10
    start_period: 10s
  restart: unless-stopped
```

**Important Notes:**
- Do NOT include `--host` in command - it's already in the image entrypoint
- Do NOT include `--chain-id DEVNET` - only `MAINNET` and `TESTNET` are valid in some versions
- Use `--seed 0` to get deterministic account addresses that match frontend config

## Pre-deployed Accounts (with --seed 0)

These accounts are automatically created by the devnet:

| Role | Address | Private Key |
|------|---------|-------------|
| Bob (Account 0) | `0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691` | `0x71d7bb07b9a64f6f78ac4c816aff4da9` |
| Alice (Account 1) | `0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1` | `0x0e1406455b7d66b1690803be066cbe5e` |

Each account has 1000 STRK initial balance.

## Deployment Steps

### 1. Install starkli

```bash
# Install starkliup if not already installed
curl https://get.starkli.sh | sh

# Install specific version
starkliup -v 0.3.5

# Verify
starkli --version
# Expected: 0.3.5 (fa4f0e3)
```

### 2. Create Account File

Create `/tmp/account.json` (or any path):

```json
{
    "version": 1,
    "variant": {
        "type": "open_zeppelin",
        "version": 1,
        "public_key": "0x39d9e6ce352ad4530a0ef5d5a18fd3303c3606a7fa6ac5b620020ad681cc33b",
        "legacy": false
    },
    "deployment": {
        "status": "deployed",
        "class_hash": "0x61dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f",
        "address": "0x64b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691"
    }
}
```

**Note:** The `class_hash` may vary between devnet versions. To get the correct one:

```bash
curl -s -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "starknet_getClassHashAt",
  "params": {
    "block_id": "latest",
    "contract_address": "0x64b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691"
  }
}' http://localhost:5050
```

### 3. Build Contract

```bash
cd connectors/starknet/htlc-contract
scarb build
```

Output files will be in `target/dev/`:
- `blacktrace_htlc_HTLC.contract_class.json` (Sierra)
- `blacktrace_htlc_HTLC.compiled_contract_class.json` (CASM)

### 4. Declare Contract

```bash
export STARKNET_RPC=http://localhost:5050

starkli declare \
  --account /tmp/account.json \
  --private-key 0x71d7bb07b9a64f6f78ac4c816aff4da9 \
  --watch \
  target/dev/blacktrace_htlc_HTLC.contract_class.json
```

This outputs the **class hash** (e.g., `0x069bb6165e9c17ca8a7ca04d3ca66db148eb599f5f4efe191c45bd67cf3e9b19`).

### 5. Deploy Contract

```bash
starkli deploy \
  --account /tmp/account.json \
  --private-key 0x71d7bb07b9a64f6f78ac4c816aff4da9 \
  --watch \
  <CLASS_HASH>
```

This outputs the **contract address** (e.g., `0x063a3f321cd01e61968f85d43f523ebfef04a03c50f2c1876508be44dccfea05`).

### 6. Update Frontend

Update the contract address in `frontend/src/lib/starknet.tsx`:

```typescript
const HTLC_CONTRACT_ADDRESS = '<NEW_CONTRACT_ADDRESS>';
```

## Troubleshooting

### "Account: invalid signature"

**Cause:** Wrong `class_hash` in account.json

**Fix:** Query the correct class hash from devnet:
```bash
curl -s -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0", "id": 1,
  "method": "starknet_getClassHashAt",
  "params": {"block_id": "latest", "contract_address": "<ACCOUNT_ADDRESS>"}
}' http://localhost:5050
```

### "Invalid block ID: unknown variant `pre_confirmed`"

**Cause:** starkli/sncast version too new for devnet

**Fix:** Downgrade starkli:
```bash
starkliup -v 0.3.5
```

### "Cannot compile Sierra version 1.5.0 with the current compiler"

**Cause:** Contract compiled with newer Cairo than devnet supports

**Fix:** Use devnet 0.1.2 or newer, OR recompile with older Scarb

### "the argument '--host' cannot be used multiple times"

**Cause:** Docker compose command includes `--host` but image entrypoint already has it

**Fix:** Remove `--host` from docker-compose command

### "ContractNotFound"

**Cause:** RPC version mismatch between starkli and devnet

**Fix:** Match versions according to compatibility matrix above

## Automated Deployment Script

See `scripts/deploy-starknet-htlc.sh` for automated deployment.

## References

- [starknet-devnet-rs releases](https://github.com/0xSpaceShard/starknet-devnet-rs/releases)
- [starkli documentation](https://book.starkli.rs/)
- [Scarb documentation](https://docs.swmansion.com/scarb/)
- [Cairo book](https://book.cairo-lang.org/)
