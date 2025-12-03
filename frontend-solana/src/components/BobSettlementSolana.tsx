/**
 * Bob Settlement Component for Solana
 *
 * This component handles Bob's settlement actions when trading ZEC for SOL/USDC.
 * It mirrors the Starknet version but uses Solana's blockchain.
 *
 * Flow:
 * 1. Alice locks ZEC on Zcash with hash_lock = SHA256(secret)
 * 2. Bob sees hash_lock, locks SOL/USDC on Solana with same hash
 * 3. Alice claims SOL/USDC by revealing secret
 * 4. Bob uses revealed secret to claim ZEC
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { bobAPI } from '../lib/api';
import { Lock, RefreshCw, CheckCircle, AlertCircle, Unlock, Clock, Zap, Coins, AlertTriangle } from 'lucide-react';
import type { Proposal, Order } from '../lib/types';
import { useTakerSolana } from '../lib/chains/solana';
import { useStore } from '../lib/store';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { logWorkflowStart, logSettlement, logStateChange, logSuccess, logError } from '../lib/logger';

// Alice's Solana address (receiver for Bob's HTLC lock)
// This matches the 'alice' keypair in solana.tsx DEVNET_ACCOUNTS
const ALICE_SOLANA_ADDRESS = 'A3eGZJQAHUhhKFtQQwvUyAaXznYRGHjwkQBrvQSJhgKR';

interface BobSettlementSolanaProps {
  onCountChange?: (count: number) => void;
}

export function BobSettlementSolana({ onCountChange }: BobSettlementSolanaProps = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [proposalsByOrder, setProposalsByOrder] = useState<Record<string, Proposal[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockingProposal, setLockingProposal] = useState<string | null>(null);
  const [claimingProposal, setClaimingProposal] = useState<string | null>(null);
  const [claimSecret, setClaimSecret] = useState<Record<string, string>>({});
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [fundingSuccess, setFundingSuccess] = useState<string | null>(null);

  // Solana wallet context
  const {
    keypair: solanaKeypair,
    address: solanaAddress,
    balance: solBalance,
    connectWallet: connectSolana,
    connection,
    refreshBalance,
    htlcClient,
  } = useTakerSolana();

  // Get Bob's user token from store
  const bobUser = useStore((state) => state.bob.user);

  // Set token on bobAPI when user is available
  useEffect(() => {
    if (bobUser?.token) {
      bobAPI.setToken(bobUser.token);
    }
  }, [bobUser?.token]);

  const fetchSettlementProposals = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch all orders and filter for Solana settlement chain
      const ordersData = await bobAPI.getOrders();
      const solanaOrders = ordersData
        .filter(o => o.settlement_chain === 'solana' || o.stablecoin === 'SOL' || o.stablecoin === 'USDC-SOL')
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setOrders(solanaOrders);

      // Fetch proposals for each order that need settlement action from Bob
      const proposalsMap: Record<string, Proposal[]> = {};
      for (const order of solanaOrders) {
        try {
          const response = await bobAPI.getProposalsForOrder(order.id);
          if (response.proposals && response.proposals.length > 0) {
            const settlementProposals = response.proposals
              .filter(p =>
                p.id &&
                p.id.trim() !== '' &&
                p.status === 'accepted' &&
                (p.settlement_status === 'alice_locked' || p.settlement_status === 'both_locked' || p.settlement_status === 'alice_claimed' || p.settlement_status === 'sol_claimed')
              )
              .sort((a, b) => {
                const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timeB - timeA;
              });

            if (settlementProposals.length > 0) {
              proposalsMap[order.id] = settlementProposals;
            }
          }
        } catch (err) {
          console.error(`Failed to fetch proposals for ${order.id}:`, err);
        }
      }
      setProposalsByOrder(proposalsMap);

      // Count total proposals
      const totalCount = Object.values(proposalsMap).reduce((acc, proposals) => acc + proposals.length, 0);
      onCountChange?.(totalCount);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch settlement proposals');
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlementProposals();
    const interval = setInterval(fetchSettlementProposals, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-connect Solana wallet if not connected
  useEffect(() => {
    if (!solanaKeypair) {
      connectSolana('bob').catch(console.error);
    }
  }, []);

  // Request SOL airdrop from devnet
  const handleFundSOL = async (amount: number) => {
    if (!solanaAddress) {
      setError('Please wait for Solana wallet to connect');
      return;
    }

    setFunding(true);
    setError('');
    setFundingSuccess(null);

    try {
      const pubkey = new PublicKey(solanaAddress);
      const signature = await connection.requestAirdrop(pubkey, amount * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(signature);

      setFundingSuccess(`Successfully funded ${amount} SOL!`);

      // Refresh balance
      await refreshBalance();

      setTimeout(() => setFundingSuccess(null), 3000);
    } catch (err: any) {
      console.error('Funding failed:', err);
      setError(err.message || 'Failed to request airdrop. Make sure you\'re on devnet.');
    } finally {
      setFunding(false);
    }
  };

  const handleLockSOL = async (proposal: Proposal, amount: number, price: number) => {
    const totalSOL = amount * price;

    logWorkflowStart('SETTLEMENT', 'Bob Locking SOL/USDC on Solana');
    logSettlement('Preparing SOL lock on Solana', 'alice_locked', {
      balance: solBalance || '0 SOL',
      required: `${totalSOL.toFixed(4)} SOL`,
      hashLock: proposal.hash_lock?.substring(0, 12) + '...'
    });

    // Check if hash_lock is available from proposal
    if (!proposal.hash_lock) {
      setError('Hash lock not available yet. The settlement service may still be processing. Please wait and try again.');
      return;
    }

    try {
      setLockingProposal(proposal.id);
      setError('');

      logSettlement('Locking SOL in HTLC', 'alice_locked', {
        amount: `${totalSOL.toFixed(4)} SOL`,
        proposalId: proposal.id.substring(0, 8) + '...'
      });

      // Lock SOL in HTLC contract using the hash_lock from Alice's ZEC HTLC
      if (!solanaKeypair) {
        throw new Error('Solana wallet not connected');
      }

      if (!htlcClient) {
        throw new Error('HTLC client not initialized');
      }

      // Use Alice's Solana address as the receiver
      const aliceAddress = ALICE_SOLANA_ADDRESS;
      const amountLamports = BigInt(Math.floor(totalSOL * LAMPORTS_PER_SOL));
      const timeoutSeconds = 30 * 60; // 30 minutes timeout

      console.log('[BobSettlementSolana] Locking SOL in HTLC:', {
        hashLock: proposal.hash_lock,
        receiver: aliceAddress,
        amountLamports: amountLamports.toString(),
        amountSOL: totalSOL.toFixed(4),
        timeoutSeconds,
      });

      // Call the HTLC contract to lock SOL
      const signature = await htlcClient.lockSOL(
        solanaKeypair,
        proposal.hash_lock,
        aliceAddress,
        amountLamports,
        timeoutSeconds
      );

      console.log('[BobSettlementSolana] SOL locked in HTLC:', signature);

      logStateChange('SETTLEMENT', 'alice_locked', 'both_locked', proposal.id.substring(0, 8) + '...');
      logSuccess('SETTLEMENT', 'SOL locked - Waiting for Alice to claim', { txHash: signature.substring(0, 12) + '...' });

      // Refresh balance
      await refreshBalance();

      // Call backend API to update settlement status
      await bobAPI.lockUSDC(proposal.id);

      // Refresh proposals to see updated status
      fetchSettlementProposals();
    } catch (err: any) {
      logError('SETTLEMENT', 'Failed to lock SOL', err);
      setError(err.response?.data?.error || err.message || 'Failed to lock SOL on Solana');
    } finally {
      setLockingProposal(null);
    }
  };

  const handleClaimZEC = async (proposalId: string) => {
    const secret = claimSecret[proposalId];
    if (!secret) {
      setError('Please enter the secret to claim ZEC');
      return;
    }

    if (!bobUser?.token) {
      setError('Not logged in. Please log in as Bob first.');
      return;
    }
    bobAPI.setToken(bobUser.token);

    try {
      setClaimingProposal(proposalId);
      setError('');
      setClaimSuccess(null);

      logWorkflowStart('SETTLEMENT', 'Bob Claiming ZEC');
      logSettlement('Claiming ZEC from Zcash HTLC', 'sol_claimed', {
        proposalId: proposalId.substring(0, 8) + '...'
      });

      // Call backend API to claim ZEC using the revealed secret
      await bobAPI.claimZEC(proposalId, secret);

      logStateChange('SETTLEMENT', 'sol_claimed', 'complete', proposalId.substring(0, 8) + '...');
      logSuccess('SETTLEMENT', 'ZEC claimed! Atomic swap complete');
      setClaimSuccess(`ZEC claimed successfully! Transaction submitted.`);

      // Clear the secret input
      setClaimSecret(prev => ({ ...prev, [proposalId]: '' }));

      // Refresh proposals
      fetchSettlementProposals();

      setTimeout(() => setClaimSuccess(null), 5000);
    } catch (err: any) {
      logError('SETTLEMENT', 'Failed to claim ZEC', err);
      setError(err.response?.data?.error || err.message || 'Failed to claim ZEC. Make sure the secret is correct.');
    } finally {
      setClaimingProposal(null);
    }
  };

  // Count total proposals
  const totalProposals = Object.values(proposalsByOrder).reduce((acc, proposals) => acc + proposals.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Settlement - Lock SOL (Solana)
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Auto-refreshing every 5 seconds - {totalProposals} Solana proposal{totalProposals !== 1 ? 's' : ''} awaiting action
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* SOL Wallet Balance and Funding */}
        <div className="mb-4 p-3 bg-green-950/20 border border-green-900 rounded-md">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-green-400 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Solana Wallet Balance
            </div>
            <div className="text-lg font-bold text-green-400">
              {solBalance || '...'}
            </div>
          </div>

          {/* Funding buttons */}
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFundSOL(1)}
              disabled={funding}
              className="flex-1"
            >
              {funding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Coins className="h-3 w-3 mr-1" />+1 SOL</>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFundSOL(2)}
              disabled={funding}
              className="flex-1"
            >
              {funding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Coins className="h-3 w-3 mr-1" />+2 SOL</>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFundSOL(5)}
              disabled={funding}
              className="flex-1"
            >
              {funding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Coins className="h-3 w-3 mr-1" />+5 SOL</>}
            </Button>
          </div>
          {fundingSuccess && (
            <div className="text-xs text-green-400 mt-2">{fundingSuccess}</div>
          )}
          <div className="text-xs text-muted-foreground mt-2">
            Request SOL airdrop from Solana devnet
          </div>
        </div>

        {totalProposals === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <Lock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <div>No Solana proposals awaiting settlement</div>
            <div className="text-xs mt-1">Solana proposals will appear here after the maker locks ZEC</div>
          </div>
        )}

        <div className="space-y-6">
          {orders.map((order) => {
            const proposals = proposalsByOrder[order.id] || [];
            if (proposals.length === 0) return null;

            return (
              <div key={order.id} className="space-y-3">
                <div className="border-b border-border pb-2">
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    For Order (Solana)
                  </div>
                  <div className="font-mono text-xs break-all text-primary">
                    {order.id}
                  </div>
                </div>

                {proposals.map((proposal, idx) => {
                  // Convert from zatoshi/lamports to ZEC/SOL
                  const zecAmount = proposal.amount / 100000000;
                  const priceSOL = proposal.price / 1000000000;
                  const totalAmount = zecAmount * priceSOL;
                  const isAliceLocked = proposal.settlement_status === 'alice_locked';
                  const isBothLocked = proposal.settlement_status === 'both_locked';
                  const isAliceClaimed = proposal.settlement_status === 'alice_claimed' || proposal.settlement_status === 'sol_claimed';

                  return (
                    <div
                      key={proposal.id || `proposal-${idx}`}
                      className={`border rounded-lg p-4 ${
                        isAliceClaimed
                          ? 'border-amber-900/50 bg-amber-950/10'
                          : isBothLocked
                            ? 'border-blue-900/50 bg-blue-950/10'
                            : 'border-green-900/50 bg-green-950/10'
                      }`}
                    >
                      <div className="mb-3 pb-2 border-b border-border">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-muted-foreground">Proposal ID</div>
                          <div className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded">
                            Solana
                          </div>
                        </div>
                        <div className="font-mono text-xs break-all text-primary">
                          {proposal.id || 'N/A'}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <div className="text-xs text-muted-foreground">ZEC Amount</div>
                          <div className="text-lg font-semibold">
                            {zecAmount.toFixed(4)} ZEC
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Price</div>
                          <div className="text-lg font-semibold">
                            {priceSOL.toFixed(4)} SOL
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">SOL {isAliceLocked ? 'to Lock' : 'Locked'}</div>
                          <div className="text-lg font-semibold text-green-400">
                            {totalAmount.toFixed(4)} SOL
                          </div>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="text-xs text-muted-foreground mb-1">Settlement Status</div>
                        <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                          isAliceClaimed
                            ? 'bg-amber-950/20 text-amber-400 border border-amber-900'
                            : isBothLocked
                              ? 'bg-blue-950/20 text-blue-400 border border-blue-900'
                              : 'bg-green-950/20 text-green-400 border border-green-900'
                        }`}>
                          {isAliceClaimed ? (
                            <>
                              <Unlock className="h-3 w-3" />
                              Alice Claimed SOL - Claim Your ZEC!
                            </>
                          ) : isBothLocked ? (
                            <>
                              <Clock className="h-3 w-3" />
                              Both Locked - Waiting for Alice to Claim
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-3 w-3" />
                              Alice Locked ZEC - Your Turn
                            </>
                          )}
                        </div>
                      </div>

                      {/* Alice Locked - Bob needs to lock */}
                      {isAliceLocked && (
                        <>
                          <div className="mb-3 p-3 bg-green-950/20 border border-green-900 rounded text-sm">
                            <div className="flex items-center gap-2 mb-2 text-green-400">
                              <AlertCircle className="h-4 w-4" />
                              <span className="font-medium">Alice has locked {zecAmount.toFixed(4)} ZEC</span>
                            </div>
                            <div className="text-xs text-green-400/80">
                              Lock your SOL on Solana. SHA256 hash ensures atomic execution with Zcash.
                            </div>
                          </div>

                          {proposal.hash_lock && (
                            <div className="mb-3 p-2 bg-blue-950/20 border border-blue-900 rounded text-xs">
                              <div className="text-blue-400 mb-1">HTLC Hash Lock (SHA256):</div>
                              <div className="font-mono text-blue-300 break-all">{proposal.hash_lock}</div>
                            </div>
                          )}

                          <Button
                            size="sm"
                            className="w-full bg-green-600 hover:bg-green-700"
                            onClick={() => handleLockSOL(proposal, zecAmount, priceSOL)}
                            disabled={lockingProposal === proposal.id || !proposal.hash_lock}
                          >
                            {lockingProposal === proposal.id ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                Locking SOL...
                              </>
                            ) : (
                              <>
                                <Lock className="h-4 w-4 mr-1" />
                                Lock {totalAmount.toFixed(4)} SOL
                              </>
                            )}
                          </Button>
                        </>
                      )}

                      {/* Both Locked - Waiting for Alice to claim */}
                      {isBothLocked && (
                        <div className="p-3 bg-blue-950/20 border border-blue-900 rounded text-sm text-blue-400">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4" />
                            <span className="font-medium">Both Parties Locked</span>
                          </div>
                          <div className="text-xs text-blue-400/80">
                            Waiting for Alice to claim SOL. When she does, the secret will be revealed and you can claim ZEC.
                          </div>
                        </div>
                      )}

                      {/* Alice Claimed - Bob can claim ZEC */}
                      {isAliceClaimed && (
                        <>
                          <div className="mb-3 p-2 bg-amber-950/20 border border-amber-900 rounded text-xs text-amber-400">
                            <div className="flex items-center gap-2 mb-1">
                              <Zap className="h-4 w-4" />
                              <span className="font-medium">Alice Claimed SOL - Secret Revealed!</span>
                            </div>
                            Enter the secret to claim your ZEC from the Zcash HTLC.
                          </div>

                          {claimSuccess && (
                            <div className="mb-3 p-2 bg-green-950/30 border border-green-800 rounded text-xs text-green-300">
                              {claimSuccess}
                            </div>
                          )}

                          <div className="space-y-3">
                            <Input
                              type="text"
                              placeholder="Enter the secret revealed by Alice"
                              value={claimSecret[proposal.id] || ''}
                              onChange={(e) => setClaimSecret(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                              disabled={claimingProposal === proposal.id}
                            />

                            <Button
                              size="sm"
                              className="w-full bg-amber-600 hover:bg-amber-700"
                              onClick={() => handleClaimZEC(proposal.id)}
                              disabled={claimingProposal === proposal.id || !claimSecret[proposal.id]}
                            >
                              {claimingProposal === proposal.id ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                  Claiming ZEC...
                                </>
                              ) : (
                                <>
                                  <Unlock className="h-4 w-4 mr-1" />
                                  Claim {zecAmount.toFixed(4)} ZEC
                                </>
                              )}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
