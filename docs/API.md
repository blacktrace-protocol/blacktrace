# BlackTrace Platform API Documentation

**Version:** 1.0.0
**Base URL (Maker Node):** `http://localhost:8080`
**Base URL (Taker Node):** `http://localhost:8081`
**Base URL (Settlement Service):** `http://localhost:8090`

---

## Authentication & Session Management

### Register User
Creates a new user identity. Does not create wallet addresses.

```http
POST /auth/register
Content-Type: application/json

{
  "username": "alice",
  "password": "securepassword123"
}
```

**Response (200 OK):**
```json
{
  "username": "alice",
  "status": "registered"
}
```

---

### Login
Authenticates user and returns session token.

```http
POST /auth/login
Content-Type: application/json

{
  "username": "alice",
  "password": "securepassword123"
}
```

**Response (200 OK):**
```json
{
  "session_id": "a52ab899b8a33711ee2713144e05e388d8c20cdb7975899ba17821cfa8e8aad4",
  "username": "alice",
  "expires_at": "2025-11-27T13:54:29Z"
}
```

---

### Logout
Terminates the current session.

```http
POST /auth/logout
Content-Type: application/json

{
  "session_id": "a52ab899b8a33711ee2713144e05e388d8c20cdb7975899ba17821cfa8e8aad4"
}
```

**Response (200 OK):**
```json
{
  "status": "logged_out"
}
```

---

### Get Current User
Returns information about the current session.

```http
POST /auth/whoami
Content-Type: application/json

{
  "session_id": "a52ab899b8a33711ee2713144e05e388d8c20cdb7975899ba17821cfa8e8aad4"
}
```

**Response (200 OK):**
```json
{
  "username": "alice",
  "session_id": "a52ab899b8a33711ee2713144e05e388d8c20cdb7975899ba17821cfa8e8aad4",
  "logged_in_at": "2025-11-26T13:54:29Z",
  "expires_at": "2025-11-27T13:54:29Z"
}
```

---

## Wallet Management

### Create Wallet
Creates a wallet address on the specified chain for the logged-in user.

```http
POST /wallet/create
Content-Type: application/json

{
  "session_id": "...",
  "chain": "zcash"
}
```

**Supported Chains:**
- `zcash` - Zcash blockchain
- `starknet` - Starknet blockchain
- (Future: `solana`, `ethereum`, etc.)

**Response (200 OK):**
```json
{
  "username": "alice",
  "chain": "zcash",
  "address": "tmGYa9ZpJEj2ScCSbjapAVR5BAjimNSqzGt",
  "status": "created"
}
```

---

### Fund Wallet
Funds a wallet address (demo/testing only - uses platform's testnet faucet).

```http
POST /wallet/fund
Content-Type: application/json

{
  "session_id": "...",
  "chain": "zcash",
  "amount": 2000.0
}
```

**Response (200 OK):**
```json
{
  "address": "tmGYa9ZpJEj2ScCSbjapAVR5BAjimNSqzGt",
  "chain": "zcash",
  "amount": 2000.0,
  "balance": 2000.0,
  "txid": "eafe7295041aefce61469ab6be7c6377a58e35c9bf1cb161d9ddd34c81deb030",
  "success": true
}
```

---

### Get Wallet Info
Returns wallet address and balance for the logged-in user.

```http
GET /wallet/info?username=alice&chain=zcash
```

**Response (200 OK):**
```json
{
  "username": "alice",
  "chain": "zcash",
  "address": "tmGYa9ZpJEj2ScCSbjapAVR5BAjimNSqzGt",
  "balance": 2000.0
}
```

---

## Order Management

### Create Order
Creates a new order to trade assets cross-chain.

```http
POST /orders/create
Content-Type: application/json

{
  "session_id": "...",
  "maker_chain": "zcash",
  "maker_asset": "ZEC",
  "amount": 10000,
  "taker_chain": "starknet",
  "taker_asset": "STRK",
  "min_price": 25.0,
  "max_price": 30.0,
  "taker_username": ""
}
```

**Fields:**
- `amount` - Amount in cents/smallest unit (10000 = 100.00 ZEC)
- `min_price` - Minimum acceptable price per unit
- `max_price` - Maximum acceptable price per unit
- `taker_username` - Optional: Lock order to specific taker (encrypted order)

**Response (200 OK):**
```json
{
  "order_id": "order_1732628069",
  "maker_chain": "zcash",
  "maker_asset": "ZEC",
  "taker_chain": "starknet",
  "taker_asset": "STRK",
  "status": "created"
}
```

---

### List Orders
Returns list of orders visible to the user.

```http
GET /orders?session_id=...
```

**Response (200 OK):**
```json
{
  "orders": [
    {
      "order_id": "order_1732628069",
      "order_type": "Sell",
      "maker_chain": "zcash",
      "maker_asset": "ZEC",
      "taker_chain": "starknet",
      "taker_asset": "STRK",
      "amount": 10000,
      "min_price": 25.0,
      "max_price": 30.0,
      "timestamp": 1732628069,
      "expiry": 1732714469
    }
  ]
}
```

---

### Get Order Details
Returns details of a specific order.

```http
GET /orders/{order_id}?session_id=...
```

**Response (200 OK):**
```json
{
  "order_id": "order_1732628069",
  "maker_chain": "zcash",
  "maker_asset": "ZEC",
  "taker_chain": "starknet",
  "taker_asset": "STRK",
  "amount": 10000,
  "min_price": 25.0,
  "max_price": 30.0,
  "timestamp": 1732628069,
  "status": "active"
}
```

---

### Cancel Order
Cancels an order created by the user.

```http
DELETE /orders/{order_id}?session_id=...
```

**Response (200 OK):**
```json
{
  "order_id": "order_1732628069",
  "status": "cancelled"
}
```

---

## Proposal Lifecycle

### Create Proposal
Submit a proposal for an order.

```http
POST /orders/{order_id}/propose
Content-Type: application/json

{
  "session_id": "...",
  "price": 27.5,
  "amount": 10000
}
```

**Response (200 OK):**
```json
{
  "proposal_id": "order_1732628069_proposal_1732628123456789000",
  "order_id": "order_1732628069",
  "price": 27.5,
  "amount": 10000,
  "status": "pending"
}
```

---

### List Proposals
Returns proposals for the user (incoming for maker, outgoing for taker).

```http
GET /proposals?session_id=...
```

**Response (200 OK):**
```json
{
  "proposals": [
    {
      "proposal_id": "order_1732628069_proposal_1732628123456789000",
      "order_id": "order_1732628069",
      "price": 27.5,
      "amount": 10000,
      "status": "pending",
      "timestamp": "2025-11-26T13:55:23Z"
    }
  ]
}
```

---

### Get Proposal Details
Returns details of a specific proposal.

```http
GET /proposals/{proposal_id}?session_id=...
```

**Response (200 OK):**
```json
{
  "proposal_id": "order_1732628069_proposal_1732628123456789000",
  "order_id": "order_1732628069",
  "price": 27.5,
  "amount": 10000,
  "status": "pending",
  "settlement_status": null,
  "timestamp": "2025-11-26T13:55:23Z"
}
```

---

### Accept Proposal
Accept a proposal (maker only).

```http
POST /proposals/{proposal_id}/accept
Content-Type: application/json

{
  "session_id": "..."
}
```

**Response (200 OK):**
```json
{
  "proposal_id": "order_1732628069_proposal_1732628123456789000",
  "status": "accepted",
  "settlement_status": "ready"
}
```

---

### Reject Proposal
Reject a proposal (maker only).

```http
POST /proposals/{proposal_id}/reject
Content-Type: application/json

{
  "session_id": "..."
}
```

**Response (200 OK):**
```json
{
  "proposal_id": "order_1732628069_proposal_1732628123456789000",
  "status": "rejected"
}
```

---

## Settlement & HTLC Operations

### Get Settlement Queue
Returns proposals awaiting settlement action from the user.

```http
GET /settlement/queue?username=alice
```

**Response (200 OK):**
```json
{
  "settlements": [
    {
      "proposal_id": "order_1732628069_proposal_1732628123456789000",
      "order_id": "order_1732628069",
      "role": "maker",
      "maker_chain": "zcash",
      "maker_asset": "ZEC",
      "maker_amount": 100.0,
      "taker_chain": "starknet",
      "taker_asset": "STRK",
      "taker_amount": 2750.0,
      "settlement_status": "ready",
      "next_action": "lock_maker_asset"
    }
  ]
}
```

---

### Lock Assets (Maker Side)
Maker locks their assets in HTLC contract.

```http
POST /settlement/{proposal_id}/lock
Content-Type: application/json

{
  "session_id": "...",
  "side": "maker",
  "chain": "zcash"
}
```

**Response (200 OK):**
```json
{
  "proposal_id": "order_1732628069_proposal_1732628123456789000",
  "side": "maker",
  "chain": "zcash",
  "status": "alice_locked",
  "lock_txid": "abc123...",
  "secret_hash": "def456..."
}
```

---

### Lock Assets (Taker Side)
Taker locks their assets in HTLC contract.

```http
POST /settlement/{proposal_id}/lock
Content-Type: application/json

{
  "session_id": "...",
  "side": "taker",
  "chain": "starknet"
}
```

**Response (200 OK):**
```json
{
  "proposal_id": "order_1732628069_proposal_1732628123456789000",
  "side": "taker",
  "chain": "starknet",
  "status": "both_locked",
  "lock_txid": "0x789abc..."
}
```

---

### Claim Assets
Claim assets from the counterparty's HTLC.

```http
POST /settlement/{proposal_id}/claim
Content-Type: application/json

{
  "session_id": "...",
  "side": "maker",
  "chain": "starknet"
}
```

**Response (200 OK):**
```json
{
  "proposal_id": "order_1732628069_proposal_1732628123456789000",
  "side": "maker",
  "chain": "starknet",
  "status": "complete",
  "claim_txid": "0xabc123...",
  "claimed_amount": 2750.0,
  "claimed_asset": "STRK"
}
```

---

### Get Settlement Status
Returns current status of a settlement.

```http
GET /settlement/{proposal_id}/status
```

**Response (200 OK):**
```json
{
  "proposal_id": "order_1732628069_proposal_1732628123456789000",
  "settlement_status": "both_locked",
  "maker_locked": true,
  "taker_locked": true,
  "maker_claimed": false,
  "taker_claimed": false,
  "secret_revealed": false,
  "timelock_expires_at": "2025-11-26T17:55:23Z"
}
```

---

## Chain Support

### Currently Supported:
- **Zcash** (`zcash`) - Testnet/Regtest
- **Starknet** (`starknet`) - Devnet

### Planned:
- **Solana** (`solana`)
- **Ethereum** (`ethereum`)
- **Bitcoin** (`bitcoin`)

### Extending for New Chains:
To add a new chain, implement the `ChainConnector` interface in the settlement service:

```go
type ChainConnector interface {
    CreateAddress() (string, error)
    FundAddress(address string, amount float64) error
    GetBalance(address string) (float64, error)
    LockInHTLC(amount float64, secretHash string, timelock int64) (txid string, error)
    ClaimFromHTLC(txid string, secret string) (claimTxid string, error)
    RefundFromHTLC(txid string) (refundTxid string, error)
}
```

---

## Error Responses

All errors return JSON with an `error` field:

```json
{
  "error": "Description of what went wrong"
}
```

**Common HTTP Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Invalid or expired session
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## Rate Limiting

Currently no rate limiting. Production deployments should implement:
- Per-user rate limits
- Per-IP rate limits
- API key authentication for apps

---

## WebSocket Support (Future)

For real-time updates on orders, proposals, and settlements:

```
ws://localhost:8080/ws?session_id=...
```

**Events:**
- `order.created`
- `order.cancelled`
- `proposal.received`
- `proposal.accepted`
- `settlement.ready`
- `settlement.locked`
- `settlement.complete`
