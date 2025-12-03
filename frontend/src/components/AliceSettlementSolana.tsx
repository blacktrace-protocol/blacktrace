import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { aliceAPI, bobAPI } from '../lib/api';
import { Lock, RefreshCw, Clock, CheckCircle, AlertTriangle, Unlock, Zap } from 'lucide-react';
import type { Proposal, Order } from '../lib/types';
import { useStore } from '../lib/store';
import { useMakerSolana } from '../lib/chains/solana';
import { logWorkflowStart, logSettlement, logStateChange, logSuccess, logError } from '../lib/logger';

interface AliceSettlementSolanaProps {
  onCountChange?: (count: number) => void;
}

export function AliceSettlementSolana({ onCountChange }: AliceSettlementSolanaProps = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [proposalsByOrder, setProposalsByOrder] = useState<Record<string, Proposal[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockingProposal, setLockingProposal] = useState<string | null>(null);
  const [claimingProposal, setClaimingProposal] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  // Secret input for claiming SOL (manual entry if not stored)
  const [claimSecret, setClaimSecret] = useState<Record<string, string>>({});
  // Track locked amounts per proposal (to show deduction from balance)
  const [lockedAmounts, setLockedAmounts] = useState<Record<string, number>>({});
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  // Get username from store
  const currentUser = useStore((state) => state.alice.user);
  const username = currentUser?.username;

  // Solana context for claiming SOL
  const { account: solanaAccount, claimFunds, connectWallet: connectSolana, balance: solBalance } = useMakerSolana();

  const fetchWalletBalance = async () => {
    if (!username) return;

    try {
      // Query node service which has user's wallet address
      const response = await fetch(`http://localhost:8080/wallet/info?username=${username}`);
      if (response.ok) {
        const data = await response.json();
        setWalletBalance(data.balance);
      }
    } catch (err) {
      console.error('Failed to fetch wallet balance:', err);
    }
  };

  const fetchSettlementProposals = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch all orders and sort by timestamp (latest first)
      const ordersData = await aliceAPI.getOrders();
      const sortedOrders = ordersData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setOrders(sortedOrders);

      // Fetch proposals for each order that need settlement action from Alice
      const proposalsMap: Record<string, Proposal[]> = {};
      for (const order of sortedOrders) {
        try {
          const response = await aliceAPI.getProposalsForOrder(order.id);
          if (response.proposals && response.proposals.length > 0) {
            // Filter proposals that are accepted and need action from Alice
            // Only show proposals with settlement_chain = 'solana'
            const settlementProposals = response.proposals
              .filter(p =>
                p.id &&
                p.id.trim() !== '' &&
                p.status === 'accepted' &&
                p.settlement_chain === 'solana' &&
                p.settlement_status !== 'sol_claimed' &&
                p.settlement_status !== 'complete' &&
                (p.settlement_status === 'ready' || p.settlement_status === 'alice_locked' || p.settlement_status === 'both_locked' || !p.settlement_status)
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
    if (username) {
      fetchWalletBalance();
    }
    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      fetchSettlementProposals();
      if (username) {
        fetchWalletBalance();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [username]);

  const handleLockZEC = async (proposalId: string, amountZEC: number) => {
    try {
      setLockingProposal(proposalId);
      setError('');

      // Check if wallet has sufficient balance
      if (walletBalance < amountZEC) {
        setError(`Insufficient funds: You have ${walletBalance.toFixed(8)} ZEC but need ${amountZEC.toFixed(2)} ZEC. Please wait for your wallet balance to confirm or add more funds.`);
        setLockingProposal(null);
        return;
      }

      logWorkflowStart('SETTLEMENT', 'Alice Locking ZEC (Solana swap)');
      logSettlement('Creating HTLC on Zcash', 'ready', {
        amount: `${amountZEC.toFixed(2)} ZEC`,
        proposalId: proposalId.substring(0, 8) + '...',
        settlementChain: 'Solana'
      });

      // Simulate wallet popup and transaction signing
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Call backend API to update settlement status (secret already set when accepting proposal)
      await aliceAPI.lockZEC(proposalId);
      logStateChange('SETTLEMENT', 'ready', 'alice_locked', proposalId.substring(0, 8) + '...');
      logSuccess('SETTLEMENT', 'ZEC locked in HTLC - Waiting for Bob to lock SOL');

      // Track the locked amount for display purposes
      setLockedAmounts(prev => ({ ...prev, [proposalId]: amountZEC }));

      // Refresh proposals to see updated status
      fetchSettlementProposals();
      fetchWalletBalance();
    } catch (err: any) {
      logError('SETTLEMENT', 'Failed to lock ZEC', err);
      setError(err.response?.data?.error || err.message || 'Failed to lock ZEC');
    } finally {
      setLockingProposal(null);
    }
  };

  const handleClaimSOL = async (proposalId: string, hashLock: string, amountSOL: number, manualSecret?: string) => {
    // Use manual input secret (user must remember the secret they used when accepting proposal)
    const secret = manualSecret || claimSecret[proposalId];
    if (!secret) {
      setError('Please enter the secret you used when accepting the proposal.');
      return;
    }

    if (!hashLock) {
      setError('No hash lock found for this proposal. Cannot claim SOL.');
      return;
    }

    if (!solanaAccount) {
      // Try to connect
      try {
        await connectSolana('alice');
      } catch (err) {
        setError('Please connect your Solana wallet first');
        return;
      }
    }

    try {
      setClaimingProposal(proposalId);
      setError('');
      setClaimSuccess(null);

      logWorkflowStart('SETTLEMENT', 'Alice Claiming SOL');
      logSettlement('Claiming SOL from Solana', 'both_locked', {
        amount: `${amountSOL} SOL`,
        hashLock: hashLock.substring(0, 12) + '...'
      });

      // Call the Solana claim function with the correct amount
      const txHash = await claimFunds(hashLock, secret, amountSOL);

      logStateChange('SETTLEMENT', 'both_locked', 'sol_claimed', proposalId.substring(0, 8) + '...');
      logSuccess('SETTLEMENT', 'SOL claimed! Secret revealed on-chain', { txHash: txHash.substring(0, 12) + '...' });

      // Update settlement status to "sol_claimed" on BOTH nodes so Bob can see it
      try {
        // Update Alice's node
        await aliceAPI.updateSettlementStatus(proposalId, 'sol_claimed');
        // Also update Bob's node (since P2P doesn't sync settlement status automatically)
        await bobAPI.updateSettlementStatus(proposalId, 'sol_claimed');
        logSettlement('Status updated on both nodes - Bob can now claim ZEC', 'sol_claimed');
      } catch (statusErr) {
        logError('SETTLEMENT', 'Failed to update status (non-blocking)', statusErr);
        // Continue anyway - the SOL claim was successful
      }

      setClaimSuccess(`SOL claimed! TX: ${txHash.slice(0, 10)}... Secret revealed - Bob can now claim ZEC.`);

      // Clear claim secret input and locked amount (settlement complete)
      setClaimSecret(prev => {
        const newSecrets = { ...prev };
        delete newSecrets[proposalId];
        return newSecrets;
      });
      setLockedAmounts(prev => {
        const newAmounts = { ...prev };
        delete newAmounts[proposalId];
        return newAmounts;
      });

      // Refresh proposals
      fetchSettlementProposals();

      // Clear success message after 5 seconds
      setTimeout(() => setClaimSuccess(null), 5000);
    } catch (err: any) {
      logError('SETTLEMENT', 'Failed to claim SOL', err);
      setError(err.message || 'Failed to claim SOL. Make sure the secret is correct.');
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
          Settlement - Lock ZEC (Solana)
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          ZEC {'<->'} SOL Atomic Swap • {totalProposals} proposal{totalProposals !== 1 ? 's' : ''} awaiting your action
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Solana wallet status */}
        <div className="mb-4 p-3 bg-purple-950/20 border border-purple-900 rounded-md">
          <div className="flex items-center justify-between">
            <div className="text-sm text-purple-400">Solana Wallet</div>
            <div className="text-lg font-bold text-purple-400">
              {solanaAccount ? `${solBalance || '0'} SOL` : 'Not Connected'}
            </div>
          </div>
          {!solanaAccount && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              onClick={() => connectSolana('alice')}
            >
              Connect Solana Wallet (Alice)
            </Button>
          )}
        </div>

        {totalProposals > 0 && (
          <div className="mb-4 p-3 bg-blue-950/20 border border-blue-900 rounded-md space-y-2">
            {Object.keys(lockedAmounts).length > 0 ? (
              <>
                {/* When ZEC is locked, wallet balance already reflects the deduction */}
                <div className="flex items-center justify-between text-amber-400">
                  <div className="text-sm flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Locked in HTLC
                  </div>
                  <div className="text-lg font-bold">
                    {Object.values(lockedAmounts).reduce((sum, amt) => sum + amt, 0).toFixed(2)} ZEC
                  </div>
                </div>
                <div className="border-t border-blue-900 pt-2 flex items-center justify-between">
                  <div className="text-sm text-green-400">Available Balance</div>
                  <div className="text-lg font-bold text-green-400">
                    {walletBalance.toFixed(4)} ZEC
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-sm text-blue-400">Wallet Balance</div>
                <div className="text-lg font-bold text-blue-400">{walletBalance.toFixed(4)} ZEC</div>
              </div>
            )}
          </div>
        )}

        {totalProposals === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <Lock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <div>No Solana proposals awaiting settlement</div>
            <div className="text-xs mt-1">Accepted proposals with Solana settlement will appear here</div>
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
                    For Order
                  </div>
                  <div className="font-mono text-xs break-all text-primary">
                    {order.id}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {proposals.length} proposal{proposals.length !== 1 ? 's' : ''} for this order
                  </div>
                </div>

                {proposals.map((proposal, idx) => {
                  const isReady = !proposal.settlement_status || proposal.settlement_status === 'ready';
                  const isAliceLocked = proposal.settlement_status === 'alice_locked';
                  const isBothLocked = proposal.settlement_status === 'both_locked';

                  // Calculate SOL amount based on exchange rate (simplified: assume 1 ZEC = 10 SOL for demo)
                  const zecAmount = proposal.amount / 100;
                  const solAmount = zecAmount * 10; // Demo exchange rate

                  return (
                    <div
                      key={proposal.id || `proposal-${idx}`}
                      className={`border rounded-lg p-4 ${
                        isBothLocked
                          ? 'border-green-900/50 bg-green-950/10'
                          : isAliceLocked
                            ? 'border-blue-900/50 bg-blue-950/10'
                            : 'border-amber-900/50 bg-amber-950/10'
                      }`}
                    >
                      <div className="mb-3 pb-2 border-b border-border">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-muted-foreground">Proposal ID</div>
                          <div className="text-xs text-purple-400">Solana Settlement</div>
                        </div>
                        <div className="font-mono text-xs break-all text-primary">
                          {proposal.id || 'N/A'}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <div className="text-xs text-muted-foreground">You Send</div>
                          <div className="text-lg font-semibold text-amber-400">
                            {zecAmount.toFixed(2)} ZEC
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">You Receive</div>
                          <div className="text-lg font-semibold text-purple-400">
                            {solAmount.toFixed(2)} SOL
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Rate</div>
                          <div className="text-lg font-semibold">
                            1:10
                          </div>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="text-xs text-muted-foreground mb-1">Settlement Status</div>
                        <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                          isBothLocked
                            ? 'bg-green-950/20 text-green-400 border border-green-900'
                            : isAliceLocked
                              ? 'bg-blue-950/20 text-blue-400 border border-blue-900'
                              : 'bg-amber-950/20 text-amber-400 border border-amber-900'
                        }`}>
                          {isBothLocked ? (
                            <>
                              <Unlock className="h-3 w-3" />
                              Both Locked - Ready to Claim SOL
                            </>
                          ) : isAliceLocked ? (
                            <>
                              <CheckCircle className="h-3 w-3" />
                              ZEC Locked - Waiting for Bob to lock SOL
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3" />
                              Ready to Lock ZEC
                            </>
                          )}
                        </div>
                      </div>

                      {isReady && (
                        <>
                          <div className="mb-3 p-2 bg-amber-950/20 border border-amber-900 rounded text-xs text-amber-400">
                            You need to lock {zecAmount.toFixed(2)} ZEC in HTLC. Bob will then lock {solAmount.toFixed(2)} SOL.
                          </div>

                          <div className="space-y-3">
                            <div className="p-2 bg-green-950/20 border border-green-900 rounded text-xs text-green-400">
                              Secret already set when you accepted this proposal. Click below to lock your ZEC.
                            </div>

                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => handleLockZEC(proposal.id, zecAmount)}
                              disabled={lockingProposal === proposal.id}
                            >
                              {lockingProposal === proposal.id ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                  Locking ZEC...
                                </>
                              ) : (
                                <>
                                  <Lock className="h-4 w-4 mr-1" />
                                  Lock {zecAmount.toFixed(2)} ZEC in HTLC
                                </>
                              )}
                            </Button>
                          </div>
                        </>
                      )}

                      {isAliceLocked && (
                        <div className="p-3 bg-blue-950/20 border border-blue-900 rounded text-sm text-blue-400">
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle className="h-4 w-4" />
                            <span className="font-medium">ZEC Locked Successfully</span>
                          </div>
                          <div className="text-xs text-blue-400/80">
                            Waiting for Bob to lock SOL on Solana. Settlement will proceed automatically once both sides are locked.
                          </div>
                        </div>
                      )}

                      {isBothLocked && (
                        <>
                          <div className="mb-3 p-2 bg-green-950/20 border border-green-900 rounded text-xs text-green-400">
                            <div className="flex items-center gap-2 mb-1">
                              <Zap className="h-4 w-4" />
                              <span className="font-medium">Both Parties Locked - Ready to Claim!</span>
                            </div>
                            Bob has locked SOL on Solana using your hash. Claim your SOL now - this will reveal the secret so Bob can claim ZEC.
                          </div>

                          {claimSuccess && (
                            <div className="mb-3 p-2 bg-green-950/30 border border-green-800 rounded text-xs text-green-300">
                              {claimSuccess}
                            </div>
                          )}

                          <div className="space-y-3">
                            <div className="space-y-2">
                              <label className="text-xs text-amber-400">
                                Enter the secret you used when accepting the proposal:
                              </label>
                              <Input
                                type="text"
                                placeholder="Enter your HTLC secret"
                                value={claimSecret[proposal.id] || ''}
                                onChange={(e) => setClaimSecret(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                                disabled={claimingProposal === proposal.id}
                                className="font-mono"
                              />
                            </div>

                            <Button
                              size="sm"
                              className="w-full bg-purple-600 hover:bg-purple-700"
                              onClick={() => handleClaimSOL(proposal.id, proposal.hash_lock || '', solAmount, claimSecret[proposal.id])}
                              disabled={claimingProposal === proposal.id || !claimSecret[proposal.id] || !proposal.hash_lock}
                            >
                              {claimingProposal === proposal.id ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                  Claiming SOL...
                                </>
                              ) : (
                                <>
                                  <Unlock className="h-4 w-4 mr-1" />
                                  Claim {solAmount.toFixed(2)} SOL
                                </>
                              )}
                            </Button>

                            <div className="text-xs text-muted-foreground text-center">
                              Claiming will reveal the secret on Solana. Bob can then use it to claim your ZEC.
                            </div>
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
