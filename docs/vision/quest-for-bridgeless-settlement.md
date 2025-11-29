# BlackTrace - The Quest for Bridgeless Cross-Chain Settlement

## The Problem

Bridges get hacked. Wormhole, Ronin, Nomad, Multichain - over $2 billion lost. The reason is simple: bridges hold your assets while they move across chains. That custodian is an attack vector.

Every bridge is a honeypot. The more value locked, the bigger the target. And when a bridge fails, users lose everything with no recourse.

This is the broken world BlackTrace was built to fix. The quest starts with a simple question: **Why do cross-chain trades require trusting a bridge with your assets?**

## The Solution

BlackTrace eliminates bridges entirely. Instead of moving assets through a custodian, it uses hash-locked escrows on each chain:

1. Your assets stay on their native chains
2. Locked by cryptography, not custody
3. Both parties get paid, or both get refunded
4. No bridge. No custodian. No single point of failure.

The mechanism is simple: Alice locks ZEC on Zcash with a secret. Bob locks USDC on Starknet with the same secret. Alice claims the USDC by revealing the secret. Bob uses that revealed secret to claim the ZEC.

If anything fails, timeouts refund both parties automatically. The atomicity is guaranteed by cryptography, not trust.

## The Vision

To build the **bridge-free cross-chain settlement layer** that crypto needs - where assets never leave your control, where there is no custodian to hack, and where atomic execution is guaranteed by math, not promises.

Cross-chain settlement without the bridge. Lock, swap, done.
