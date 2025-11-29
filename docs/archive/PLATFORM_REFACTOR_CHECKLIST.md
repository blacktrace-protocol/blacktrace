# BlackTrace Platform Refactor - Implementation Checklist

This document tracks the refactoring of BlackTrace from a hardcoded demo to a proper platform that third-party developers can build apps on.

## ✅ Completed

### Documentation
- [x] **API Documentation** (`docs/API.md`)
  - Complete REST API reference
  - Authentication, wallets, orders, proposals, settlement
  - Chain-agnostic design
  - Sample requests/responses

- [x] **Test Suite** (`tests/api-test-suite.sh`)
  - End-to-end workflow tests
  - Can test without frontend
  - Covers all API endpoints
  - Color-coded output with pass/fail counts

- [x] **Chain Connector Architecture** (`docs/CHAIN_CONNECTORS.md`)
  - Interface definition for new chains
  - Example implementation for Solana
  - HTLC program examples
  - Security considerations

### Code Changes (In Progress)
- [x] Started removing hardcoded alice/bob from settlement-service (line 219-241 in main.go)

## 🚧 In Progress

### Settlement Service Refactoring

#### 1. Remove Hardcoded Users
**Files:** `settlement-service/main.go`

- [x] Remove alice/bob address creation from initialization (lines 219-241)
- [ ] Remove `aliceAddress` and `bobAddress` fields from SettlementService struct
- [ ] Remove `handleAliceBalance` function (line 559+)
- [ ] Remove `handleBobBalance` function
- [ ] Remove `/api/alice/balance` endpoint registration (line 755)
- [ ] Remove `/api/bob/balance` endpoint registration (line 756)

**Estimated time:** 15 minutes

---

#### 2. Make Wallet Creation Frontend-Driven
**Files:** `node/api.go`

Currently at line 307-326, registration automatically creates a Zcash address. Change to:

- [ ] Remove automatic wallet creation from `handleAuthRegister`
- [ ] Add new `handleWalletCreate` endpoint
- [ ] Update frontend to call wallet creation explicitly after registration

**Estimated time:** 30 minutes

---

#### 3. Add Generic Wallet Endpoints
**Files:** `node/api.go`, `settlement-service/main.go`

Add endpoints that work with any chain:

- [ ] `POST /wallet/create` - Create wallet for any chain
  ```go
  type WalletCreateRequest struct {
      SessionID string `json:"session_id"`
      Chain     string `json:"chain"`  // "zcash", "starknet", "solana", etc.
  }
  ```

- [ ] `POST /wallet/fund` - Fund wallet on any chain
  ```go
  type WalletFundRequest struct {
      SessionID string  `json:"session_id"`
      Chain     string  `json:"chain"`
      Amount    float64 `json:"amount"`
  }
  ```

- [ ] `GET /wallet/info` - Get wallet info with chain parameter
  ```
  GET /wallet/info?username=alice&chain=zcash
  ```

**Estimated time:** 45 minutes

---

#### 4. Add Settlement Queue Endpoint
**Files:** `settlement-service/main.go`

- [ ] Implement `GET /settlement/queue?username=alice`
- [ ] Return list of proposals awaiting action from user
- [ ] Include next action to take (lock_maker, lock_taker, claim_maker, claim_taker)

**Estimated time:** 30 minutes

---

#### 5. Add Generic HTLC Endpoints
**Files:** `node/api.go`, `settlement-service/main.go`

Currently HTLC operations happen via NATS messages. Add HTTP endpoints:

- [ ] `POST /settlement/:proposal_id/lock`
  ```json
  {
    "session_id": "...",
    "side": "maker" | "taker",
    "chain": "zcash" | "starknet"
  }
  ```

- [ ] `POST /settlement/:proposal_id/claim`
  ```json
  {
    "session_id": "...",
    "side": "maker" | "taker",
    "chain": "starknet" | "zcash"
  }
  ```

- [ ] `GET /settlement/:proposal_id/status`
  - Returns current settlement state
  - Shows which side has locked/claimed
  - Shows timelock expiration

**Estimated time:** 1.5 hours

---

### Frontend Updates

#### 6. Update Wallet Flow
**Files:** `frontend/src/components/*.tsx`

- [ ] Remove assumption that wallet exists after registration
- [ ] Add "Create Wallet" button/flow
- [ ] Show wallet creation status
- [ ] Update "Fund Wallet" to use new API

**Estimated time:** 45 minutes

---

#### 7. Update Settlement UI
**Files:** `frontend/src/components/AliceSettlement.tsx`, `frontend/src/components/BobSettlement.tsx`

- [ ] Use `/settlement/queue` API instead of hardcoded endpoints
- [ ] Show settlement status from `/settlement/:id/status`
- [ ] Add lock/claim buttons that call generic endpoints

**Estimated time:** 1 hour

---

### Chain Abstraction

#### 8. Update Order Structure
**Files:** `node/types.go`, `node/api.go`

Orders should specify chains:

```go
type Order struct {
    OrderID      OrderID  `json:"order_id"`
    MakerChain   string   `json:"maker_chain"`   // "zcash"
    MakerAsset   string   `json:"maker_asset"`   // "ZEC"
    TakerChain   string   `json:"taker_chain"`   // "starknet"
    TakerAsset   string   `json:"taker_asset"`   // "STRK"
    Amount       uint64   `json:"amount"`
    MinPrice     uint64   `json:"min_price"`
    MaxPrice     uint64   `json:"max_price"`
}
```

- [ ] Update Order struct
- [ ] Update order creation API
- [ ] Update order listing/filtering

**Estimated time:** 1 hour

---

#### 9. Implement Chain Connector Interface
**Files:** New file `settlement-service/connector/interface.go`

- [ ] Define ChainConnector interface
- [ ] Refactor Zcash client to implement interface
- [ ] Refactor Starknet client to implement interface
- [ ] Create connector registry in settlement service

**Estimated time:** 2 hours

---

## 📋 Testing Checklist

After implementation:

- [ ] Run test suite: `./tests/api-test-suite.sh`
- [ ] Test with frontend
- [ ] Test ZEC ↔ STRK swap end-to-end
- [ ] Test wallet creation for both Alice and Bob
- [ ] Test fund wallet for both users
- [ ] Test order creation with chain parameters
- [ ] Test settlement flow with new endpoints

---

## 🎯 Priority Order

### Phase 1: Core Platform (2-3 hours)
1. Remove hardcoded alice/bob
2. Make wallet creation frontend-driven
3. Add generic wallet endpoints
4. Update frontend wallet flow

**Goal:** Platform has no hardcoded users, wallet creation is explicit

### Phase 2: Settlement APIs (2-3 hours)
5. Add settlement queue endpoint
6. Add generic HTLC endpoints
7. Update frontend settlement UI

**Goal:** Complete API for settlement operations

### Phase 3: Chain Abstraction (3-4 hours)
8. Update order structure with chain fields
9. Implement chain connector interface

**Goal:** Easy to add new chains

---

## 🚀 Quick Wins (Do These First)

1. **Remove alice/bob balance endpoints** (5 min)
   - Delete `/api/alice/balance` and `/api/bob/balance`
   - They're not used by platform apps

2. **Add settlement queue endpoint** (30 min)
   - Easy to implement
   - Huge value for frontend developers

3. **Make test suite pass** (varies)
   - As you implement features, test suite will pass more tests
   - Goal: Get to 100% pass rate

---

## 📊 Current Status

**Estimated Total Time:** 8-12 hours
**Completed:** ~5%
**Documentation:** 100% ✅

**Next Steps:**
1. Remove alice/bob balance endpoints
2. Remove alice/bob from settlement service struct
3. Test that existing functionality still works
4. Add settlement queue endpoint
5. Run test suite and fix failures one by one

---

## 🤝 How to Contribute

### For Core Team
Follow this checklist top to bottom, checking off items as you complete them.

### For Community
Pick any unchecked item, implement it, and submit a PR with:
- Implementation
- Tests
- Updated documentation

### Testing
After any change:
```bash
# Run test suite
./tests/api-test-suite.sh

# Test specific endpoint
curl http://localhost:8080/wallet/create \
  -H "Content-Type: application/json" \
  -d '{"session_id": "...", "chain": "zcash"}'
```

---

## 📝 Notes

- **Backwards compatibility:** Not a concern - this is a breaking change to make it a proper platform
- **Database migrations:** Not needed - all data is in-memory/files
- **API versioning:** Not needed yet - we're pre-1.0
- **Chain support:** Focus on Zcash and Starknet first, design for extensibility

## ✨ Success Criteria

A developer should be able to:
1. Read API.md and understand all endpoints
2. Run test suite and see all tests pass
3. Build an app on top of BlackTrace without modifying platform code
4. Add a new blockchain by implementing ChainConnector interface
5. Deploy their app and platform separately
