# Zcash Regtest Tooling Guide

This document captures the configuration and setup for running Zcash regtest node for BlackTrace HTLC testing.

## Working Configuration (Tested)

| Component | Version | Notes |
|-----------|---------|-------|
| **zcashd** | `v5.8.0` | Docker image: `electriccoinco/zcashd:v5.8.0` |
| **Network** | `regtest` | Local testing network |
| **RPC Port** | `18232` | Default regtest RPC port |
| **P2P Port** | `18233` | Default regtest P2P port |

## Docker Compose Configuration

The working configuration for `docker-compose.blockchains.yml`:

```yaml
zcash-regtest:
  image: electriccoinco/zcashd:v5.8.0
  container_name: blacktrace-zcash-regtest
  environment:
    - ZCASH_NETWORK=regtest
  ports:
    - "18232:18232"  # RPC port
    - "18233:18233"  # P2P port (regtest)
  networks:
    - blacktrace-net
  volumes:
    - zcash-regtest-data:/root/.zcash
    - ./zcash-regtest.conf:/root/.zcash/zcash.conf:ro
  command: >
    -regtest
    -rpcuser=blacktrace
    -rpcpassword=regtest123
    -rpcallowip=0.0.0.0/0
    -rpcbind=0.0.0.0
    -server=1
    -txindex=1
    -experimentalfeatures
    -orchardwallet
    -allowdeprecated=getnewaddress
    -allowdeprecated=z_getnewaddress
    -allowdeprecated=z_getbalance
    -allowdeprecated=z_gettotalbalance
    -allowdeprecated=z_listaddresses
  healthcheck:
    test: ["CMD", "zcash-cli", "-regtest", "-rpcuser=blacktrace", "-rpcpassword=regtest123", "getblockchaininfo"]
    interval: 10s
    timeout: 5s
    retries: 10
    start_period: 30s
  restart: unless-stopped
```

## Important Configuration Notes

### Deprecated RPC Methods

Starting with zcashd v5.8.0, several RPC methods are deprecated. For backwards compatibility with existing code, you **must** explicitly enable them via command-line flags:

| Flag | RPC Method | Used For |
|------|------------|----------|
| `-allowdeprecated=getnewaddress` | `getnewaddress` | Creating transparent addresses (user registration) |
| `-allowdeprecated=z_getnewaddress` | `z_getnewaddress` | Creating shielded addresses |
| `-allowdeprecated=z_getbalance` | `z_getbalance` | Querying address balances |
| `-allowdeprecated=z_gettotalbalance` | `z_gettotalbalance` | Querying total wallet balance |
| `-allowdeprecated=z_listaddresses` | `z_listaddresses` | Listing wallet addresses |

**Critical:** These flags must be in the `command` section of docker-compose, not just in the config file. Command-line arguments take precedence over config file settings.

### Config File vs Command Line

The `zcash-regtest.conf` file is mounted but command-line arguments in docker-compose override it. Key settings should be in both places for clarity, but the command-line is authoritative.

### Experimental Features

For Orchard (shielded) wallet support:
- `-experimentalfeatures` - Enable experimental features
- `-orchardwallet` - Enable Orchard wallet functionality

## RPC Credentials

| Setting | Value |
|---------|-------|
| **RPC User** | `blacktrace` |
| **RPC Password** | `regtest123` |
| **RPC Bind** | `0.0.0.0` (all interfaces) |
| **RPC Allow IP** | `0.0.0.0/0` (all IPs - devnet only!) |

## Common Operations

### Generate Blocks (Mining)

Regtest requires manual block generation. To mine blocks and get funds:

```bash
# Mine 101 blocks to an address (100 blocks needed for coinbase maturity)
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  generate 101

# Or generate to a specific address
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  generatetoaddress 101 <ADDRESS>
```

### Create New Address

```bash
# Transparent address
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  getnewaddress

# Shielded (Sapling) address
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  z_getnewaddress sapling
```

### Check Balance

```bash
# Transparent balance
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  getbalance

# Shielded balance
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  z_gettotalbalance
```

### Get Blockchain Info

```bash
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  getblockchaininfo
```

### Send Transaction

```bash
# Transparent send
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  sendtoaddress <ADDRESS> <AMOUNT>

# After sending, mine a block to confirm
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  generate 1
```

## Troubleshooting

### "getnewaddress is DEPRECATED"

**Error:**
```
getnewaddress is DEPRECATED and will be removed in a future release.
Use z_getnewaccount and z_getaddressforaccount instead, or restart with `-allowdeprecated=getnewaddress`
```

**Cause:** zcashd v5.8.0 deprecated several RPC methods

**Fix:** Add `-allowdeprecated=getnewaddress` to docker-compose command section (not just config file)

### Container Not Starting

**Check logs:**
```bash
docker logs blacktrace-zcash-regtest
```

**Common issues:**
- Port already in use (another zcashd instance running)
- Corrupt data directory (remove volume and restart)

### RPC Connection Refused

**Cause:** Node not fully started or RPC not bound correctly

**Fix:** Wait for healthcheck to pass, verify `-rpcbind=0.0.0.0` is set

### Insufficient Funds

**Cause:** No blocks mined in regtest

**Fix:** Mine blocks to generate coinbase rewards:
```bash
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  generate 101
```

### Transaction Not Confirming

**Cause:** Regtest doesn't auto-mine blocks

**Fix:** Manually generate blocks after each transaction:
```bash
docker exec blacktrace-zcash-regtest zcash-cli -regtest \
  -rpcuser=blacktrace -rpcpassword=regtest123 \
  generate 1
```

## HTLC-Specific Operations

### Creating HTLC Lock Transaction

The settlement service uses these RPCs for HTLC:
1. `getnewaddress` - Create address for user registration
2. `createrawtransaction` - Build HTLC lock transaction
3. `signrawtransaction` - Sign the transaction
4. `sendrawtransaction` - Broadcast to network
5. `generate` - Mine block to confirm

### Timelock Considerations

In regtest, block times are controlled manually. For HTLC testing:
- Mine blocks as needed to simulate time passing
- Timelock is based on block height, not wall clock time
- Use `getblockcount` to check current height

## Data Persistence

The volume `zcash-regtest-data` persists blockchain data between restarts. To reset:

```bash
# Stop container
docker-compose -f docker-compose.yml -f docker-compose.blockchains.yml stop zcash-regtest

# Remove volume
docker volume rm config_zcash-regtest-data

# Restart fresh
docker-compose -f docker-compose.yml -f docker-compose.blockchains.yml up -d zcash-regtest
```

## References

- [Zcash Documentation](https://zcash.readthedocs.io/)
- [zcashd RPC Reference](https://zcash.github.io/rpc/)
- [Zcash Docker Images](https://hub.docker.com/r/electriccoinco/zcashd)
- [Zcash Deprecation Policy](https://zcash.readthedocs.io/en/latest/rtd_pages/deprecation.html)
