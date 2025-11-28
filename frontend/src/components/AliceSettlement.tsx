import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { aliceAPI, bobAPI } from '../lib/api';
import { Lock, RefreshCw, Clock, CheckCircle, AlertTriangle, Unlock, Zap } from 'lucide-react';
import type { Proposal, Order } from '../lib/types';
import { useStore } from '../lib/store';
import { useMakerStarknet } from '../lib/starknet';
import { logWorkflowStart, logSettlement, logStateChange, logSuccess, logError } from '../lib/logger';

interface AliceSettlementProps {
  onCountChange?: (count: number) => void;
}

export function AliceSettlement({ onCountChange }: AliceSettlementProps = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [proposalsByOrder, setProposalsByOrder] = useState<Record<string, Proposal[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockingProposal, setLockingProposal] = useState<string | null>(null);
  const [claimingProposal, setClaimingProposal] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  // Secret input for locking ZEC (Alice creates this)
  const [lockSecret, setLockSecret] = useState<Record<string, string>>({});
  // Stored secrets for proposals that have been locked (used when claiming STRK)
  const [storedSecrets, setStoredSecrets] = useState<Record<string, string>>({});
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  // Get username from store
  const currentUser = useStore((state) => state.alice.user);
  const username = currentUser?.username;

  // Starknet context for claiming STRK
  const { account: starknetAccount, claimFunds, connectWallet: connectStarknet } = useMakerStarknet();

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
            // Exclude strk_claimed (Alice is done) and complete (fully settled)
            const settlementProposals = response.proposals
              .filter(p =>
                p.id &&
                p.id.trim() !== '' &&
                p.status === 'accepted' &&
                p.settlement_status !== 'strk_claimed' &&
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
    const secret = lockSecret[proposalId];
    if (!secret || secret.trim().length < 8) {
      setError('Please enter a secret (at least 8 characters). Keep this secret safe - you will need it to claim STRK!');
      return;
    }

    try {
      setLockingProposal(proposalId);
      setError('');

      // Check if wallet has sufficient balance
      if (walletBalance < amountZEC) {
        setError(`Insufficient funds: You have ${walletBalance.toFixed(8)} ZEC but need ${amountZEC.toFixed(2)} ZEC. Please wait for your wallet balance to confirm or add more funds.`);
        setLockingProposal(null);
        return;
      }

      // Compute hash of secret (in real implementation this would be SHA256)
      // For now we'll send the secret to the backend which will compute the hash
      logWorkflowStart('SETTLEMENT', 'Alice Locking ZEC');
      logSettlement('Creating HTLC on Zcash', 'ready', {
        amount: `${amountZEC.toFixed(2)} ZEC`,
        proposalId: proposalId.substring(0, 8) + '...'
      });

      // Simulate wallet popup and transaction signing
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Call backend API to update settlement status (include secret for hash computation)
      await aliceAPI.lockZEC(proposalId, secret);
      logStateChange('SETTLEMENT', 'ready', 'alice_locked', proposalId.substring(0, 8) + '...');
      logSuccess('SETTLEMENT', 'ZEC locked in HTLC - Waiting for Bob to lock STRK');

      // Store the secret for later use when claiming STRK
      setStoredSecrets(prev => ({ ...prev, [proposalId]: secret }));

      // Clear the lock secret input
      setLockSecret(prev => ({ ...prev, [proposalId]: '' }));

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

  const handleClaimSTRK = async (proposalId: string, hashLock: string, amountSTRK: number, manualSecret?: string) => {
    // Use stored secret first, then fall back to manual input
    const secret = storedSecrets[proposalId] || manualSecret;
    if (!secret) {
      setError('No secret found. Please enter the secret you used when locking ZEC.');
      return;
    }

    if (!hashLock) {
      setError('No hash lock found for this proposal. Cannot claim STRK.');
      return;
    }

    if (!starknetAccount) {
      // Try to connect
      try {
        await connectStarknet('alice');
      } catch (err) {
        setError('Please connect your Starknet wallet first (go to Starknet tab)');
        return;
      }
    }

    try {
      setClaimingProposal(proposalId);
      setError('');
      setClaimSuccess(null);

      logWorkflowStart('SETTLEMENT', 'Alice Claiming STRK');
      logSettlement('Claiming STRK from Starknet', 'both_locked', {
        amount: `${amountSTRK} STRK`,
        hashLock: hashLock.substring(0, 12) + '...'
      });

      // Call the Starknet claim function with the correct amount
      const txHash = await claimFunds(hashLock, secret, amountSTRK);

      logStateChange('SETTLEMENT', 'both_locked', 'strk_claimed', proposalId.substring(0, 8) + '...');
      logSuccess('SETTLEMENT', 'STRK claimed! Secret revealed on-chain', { txHash: txHash.substring(0, 12) + '...' });

      // Update settlement status to "strk_claimed" on BOTH nodes so Bob can see it
      try {
        // Update Alice's node
        await aliceAPI.updateSettlementStatus(proposalId, 'strk_claimed');
        // Also update Bob's node (since P2P doesn't sync settlement status automatically)
        await bobAPI.updateSettlementStatus(proposalId, 'strk_claimed');
        logSettlement('Status updated on both nodes - Bob can now claim ZEC', 'strk_claimed');
      } catch (statusErr) {
        logError('SETTLEMENT', 'Failed to update status (non-blocking)', statusErr);
        // Continue anyway - the STRK claim was successful
      }

      setClaimSuccess(`STRK claimed! TX: ${txHash.slice(0, 10)}... Secret revealed - Bob can now claim ZEC.`);

      // Clear stored secret (it's now public)
      setStoredSecrets(prev => {
        const newSecrets = { ...prev };
        delete newSecrets[proposalId];
        return newSecrets;
      });

      // Refresh proposals
      fetchSettlementProposals();

      // Clear success message after 5 seconds
      setTimeout(() => setClaimSuccess(null), 5000);
    } catch (err: any) {
      logError('SETTLEMENT', 'Failed to claim STRK', err);
      setError(err.message || 'Failed to claim STRK. Make sure the secret is correct.');
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
          Settlement - Lock ZEC
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Auto-refreshing every 5 seconds • {totalProposals} proposal{totalProposals !== 1 ? 's' : ''} awaiting your action
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {totalProposals > 0 && (
          <div className="mb-4 p-3 bg-blue-950/20 border border-blue-900 rounded-md">
            <div className="flex items-center justify-between">
              <div className="text-sm text-blue-400">Available Wallet Balance</div>
              <div className="text-lg font-bold text-blue-400">{walletBalance.toFixed(8)} ZEC</div>
            </div>
          </div>
        )}

        {totalProposals === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <Lock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <div>No proposals awaiting settlement</div>
            <div className="text-xs mt-1">Accepted proposals will appear here when ready for you to lock ZEC</div>
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
                          <div className="text-xs text-muted-foreground">
                            {proposal.timestamp ? new Date(proposal.timestamp).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                        <div className="font-mono text-xs break-all text-primary">
                          {proposal.id || 'N/A'}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <div className="text-xs text-muted-foreground">Amount</div>
                          <div className="text-lg font-semibold">
                            {(proposal.amount / 100).toFixed(2)} ZEC
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Price</div>
                          <div className="text-lg font-semibold">
                            ${proposal.price}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Total</div>
                          <div className="text-lg font-semibold text-primary">
                            ${(proposal.amount / 100 * proposal.price).toFixed(2)}
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
                              Both Locked - Ready to Claim STRK
                            </>
                          ) : isAliceLocked ? (
                            <>
                              <CheckCircle className="h-3 w-3" />
                              ZEC Locked - Waiting for Bob
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
                            ⚠️ You need to lock {(proposal.amount / 100).toFixed(2)} ZEC in HTLC to proceed with settlement
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-amber-400">
                                🔑 Create HTLC Secret
                              </label>
                              <Input
                                type="text"
                                placeholder="Enter a secret phrase (min 8 chars) - SAVE THIS!"
                                value={lockSecret[proposal.id] || ''}
                                onChange={(e) => setLockSecret(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                                disabled={lockingProposal === proposal.id}
                                className="font-mono"
                              />
                              <div className="text-xs text-amber-400/70">
                                ⚠️ IMPORTANT: Save this secret! You'll need it to claim STRK after Bob locks.
                              </div>
                            </div>

                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => handleLockZEC(proposal.id, proposal.amount / 100)}
                              disabled={lockingProposal === proposal.id || !lockSecret[proposal.id] || lockSecret[proposal.id].length < 8}
                            >
                              {lockingProposal === proposal.id ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                  Locking ZEC...
                                </>
                              ) : (
                                <>
                                  <Lock className="h-4 w-4 mr-1" />
                                  Lock {(proposal.amount / 100).toFixed(2)} ZEC with Secret
                                </>
                              )}
                            </Button>
                            <div className="text-xs text-muted-foreground text-center">
                              The hash of your secret will be used in the HTLC. Bob will lock STRK using the same hash.
                            </div>
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
                            Waiting for Bob to lock STRK on Starknet. Settlement will proceed automatically once both sides are locked.
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
                            Bob has locked STRK on Starknet using your hash. Claim your STRK now - this will reveal the secret so Bob can claim ZEC.
                          </div>

                          {claimSuccess && (
                            <div className="mb-3 p-2 bg-green-950/30 border border-green-800 rounded text-xs text-green-300">
                              ✅ {claimSuccess}
                            </div>
                          )}

                          <div className="space-y-3">
                            {storedSecrets[proposal.id] ? (
                              // Secret is stored from when Alice locked ZEC
                              <div className="p-2 bg-green-950/30 border border-green-800 rounded">
                                <div className="text-xs text-green-400 mb-1">🔑 Your stored secret:</div>
                                <div className="font-mono text-sm text-green-300 break-all">
                                  {storedSecrets[proposal.id]}
                                </div>
                              </div>
                            ) : (
                              // Secret not stored - ask user to enter it manually
                              <div className="space-y-2">
                                <label className="text-xs text-amber-400">
                                  ⚠️ Secret not found in memory. Please enter the secret you used when locking ZEC:
                                </label>
                                <Input
                                  type="text"
                                  placeholder="Enter your HTLC secret"
                                  value={lockSecret[proposal.id] || ''}
                                  onChange={(e) => setLockSecret(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                                  disabled={claimingProposal === proposal.id}
                                  className="font-mono"
                                />
                              </div>
                            )}

                            <Button
                              size="sm"
                              className="w-full bg-green-600 hover:bg-green-700"
                              onClick={() => handleClaimSTRK(proposal.id, proposal.hash_lock || '', proposal.amount / 100 * proposal.price, lockSecret[proposal.id])}
                              disabled={claimingProposal === proposal.id || (!storedSecrets[proposal.id] && !lockSecret[proposal.id]) || !proposal.hash_lock}
                            >
                              {claimingProposal === proposal.id ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                  Claiming STRK...
                                </>
                              ) : (
                                <>
                                  <Unlock className="h-4 w-4 mr-1" />
                                  Claim {(proposal.amount / 100 * proposal.price).toFixed(0)} STRK
                                </>
                              )}
                            </Button>

                            <div className="text-xs text-muted-foreground text-center">
                              ⚠️ Claiming will reveal the secret on Starknet. Bob can then use it to claim your ZEC.
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
