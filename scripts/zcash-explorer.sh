#!/bin/bash

# Zcash Regtest Explorer Helper Script

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 ZCASH REGTEST EXPLORER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Blockchain info
echo "📊 BLOCKCHAIN INFO:"
docker exec zcash-regtest zcash-cli -regtest getblockchaininfo | jq '{
  chain: .chain,
  blocks: .blocks,
  difficulty: .difficulty,
  chainValue: .chainSupply.chainValue
}'
echo ""

# Wallet info
echo "💰 WALLET INFO:"
docker exec zcash-regtest zcash-cli -regtest getwalletinfo | jq '{
  balance: .balance,
  immature_balance: .immature_balance,
  txcount: .txcount
}'
echo ""

# Recent transactions
echo "📝 RECENT TRANSACTIONS (last 10):"
docker exec zcash-regtest zcash-cli -regtest listtransactions "*" 10 | jq '.[] | {
  txid: .txid,
  category: .category,
  amount: .amount,
  confirmations: .confirmations,
  address: .address
}'
echo ""

# Network info
echo "🌐 NETWORK INFO:"
docker exec zcash-regtest zcash-cli -regtest getnetworkinfo | jq '{
  version: .version,
  subversion: .subversion,
  connections: .connections
}'
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 USEFUL COMMANDS:"
echo "  View specific TX:    docker exec zcash-regtest zcash-cli -regtest gettransaction <txid>"
echo "  View block:          docker exec zcash-regtest zcash-cli -regtest getblock <hash>"
echo "  Mine blocks:         docker exec zcash-regtest zcash-cli -regtest generate <n>"
echo "  List addresses:      docker exec zcash-regtest zcash-cli -regtest listaddressgroupings"
echo "  View mempool:        docker exec zcash-regtest zcash-cli -regtest getrawmempool"
echo ""
