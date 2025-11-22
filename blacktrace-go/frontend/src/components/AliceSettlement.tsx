import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { aliceAPI } from '../lib/api';
import { Lock, RefreshCw, Clock, CheckCircle } from 'lucide-react';
import type { Proposal, Order } from '../lib/types';

interface AliceSettlementProps {
  onCountChange?: (count: number) => void;
}

export function AliceSettlement({ onCountChange }: AliceSettlementProps = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [proposalsByOrder, setProposalsByOrder] = useState<Record<string, Proposal[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockingProposal, setLockingProposal] = useState<string | null>(null);

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
            // Filter proposals that are accepted and either ready or alice_locked
            const settlementProposals = response.proposals
              .filter(p =>
                p.id &&
                p.id.trim() !== '' &&
                p.status === 'accepted' &&
                (p.settlement_status === 'ready' || p.settlement_status === 'alice_locked' || !p.settlement_status)
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
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchSettlementProposals, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLockZEC = async (proposalId: string) => {
    try {
      setLockingProposal(proposalId);
      setError('');

      // TODO: Integrate with real Zcash wallet
      // This is a mock implementation
      console.log('🔐 Mock Zcash Wallet Integration:');
      console.log('  1. Generate HTLC parameters (hash, timelock)');
      console.log('  2. Request user signature via Zcash wallet popup');
      console.log('  3. Submit signed transaction to Zcash network');
      console.log('  4. Wait for confirmation');
      console.log(`  Proposal ID: ${proposalId}`);

      // Simulate wallet popup and transaction signing
      await new Promise(resolve => setTimeout(resolve, 1500));

      // TODO: Replace with actual API call to backend to update settlement_status
      // For now, just refresh to see backend updates via NATS
      console.log('✅ Mock: ZEC locked successfully, notifying settlement service...');

      // Refresh proposals to see updated status
      fetchSettlementProposals();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to lock ZEC');
    } finally {
      setLockingProposal(null);
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
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4">
            {error}
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

                  return (
                    <div
                      key={proposal.id || `proposal-${idx}`}
                      className={`border rounded-lg p-4 ${
                        isAliceLocked
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
                            {proposal.amount} ZEC
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
                            ${(proposal.amount * proposal.price).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="text-xs text-muted-foreground mb-1">Settlement Status</div>
                        <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                          isAliceLocked
                            ? 'bg-blue-950/20 text-blue-400 border border-blue-900'
                            : 'bg-amber-950/20 text-amber-400 border border-amber-900'
                        }`}>
                          {isAliceLocked ? (
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
                            ⚠️ You need to lock {proposal.amount} ZEC in HTLC to proceed with settlement
                          </div>
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => handleLockZEC(proposal.id)}
                            disabled={lockingProposal === proposal.id}
                          >
                            {lockingProposal === proposal.id ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                Signing Transaction...
                              </>
                            ) : (
                              <>
                                <Lock className="h-4 w-4 mr-1" />
                                Lock {proposal.amount} ZEC
                              </>
                            )}
                          </Button>
                          <div className="text-xs text-muted-foreground mt-2 text-center">
                            This will open your Zcash wallet to sign the HTLC transaction
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
                            Waiting for Bob to lock USDC on Starknet. Settlement will proceed automatically once both sides are locked.
                          </div>
                        </div>
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
