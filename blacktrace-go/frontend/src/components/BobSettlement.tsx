import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { bobAPI } from '../lib/api';
import { Lock, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import type { Proposal, Order } from '../lib/types';

interface BobSettlementProps {
  onCountChange?: (count: number) => void;
}

export function BobSettlement({ onCountChange }: BobSettlementProps = {}) {
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
      const ordersData = await bobAPI.getOrders();
      const sortedOrders = ordersData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setOrders(sortedOrders);

      // Fetch proposals for each order that need settlement action from Bob
      const proposalsMap: Record<string, Proposal[]> = {};
      for (const order of sortedOrders) {
        try {
          const response = await bobAPI.getProposalsForOrder(order.id);
          if (response.proposals && response.proposals.length > 0) {
            // Filter proposals where Alice has locked ZEC (alice_locked status)
            const settlementProposals = response.proposals
              .filter(p =>
                p.id &&
                p.id.trim() !== '' &&
                p.status === 'accepted' &&
                p.settlement_status === 'alice_locked'
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

  const handleLockUSDC = async (proposalId: string, amount: number, price: number) => {
    try {
      setLockingProposal(proposalId);
      setError('');

      const totalUSDC = amount * price;

      // TODO: Integrate with real Starknet/ArgentX wallet
      // This is a mock implementation
      console.log('🔐 Mock Starknet Wallet Integration (ArgentX):');
      console.log('  1. Connect to ArgentX wallet');
      console.log('  2. Generate HTLC parameters (hash from Alice, timelock)');
      console.log('  3. Request user signature via ArgentX popup');
      console.log('  4. Submit signed transaction to Starknet HTLC contract');
      console.log('  5. Wait for confirmation');
      console.log(`  Proposal ID: ${proposalId}`);
      console.log(`  Amount to lock: ${totalUSDC.toFixed(2)} USDC`);

      // Simulate wallet popup and transaction signing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // TODO: Replace with actual API call to backend to update settlement_status
      // For now, just refresh to see backend updates via NATS
      console.log('✅ Mock: USDC locked successfully, notifying settlement service...');

      // Refresh proposals to see updated status
      fetchSettlementProposals();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to lock USDC');
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
          Settlement - Lock USDC
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
            <div className="text-xs mt-1">Proposals will appear here after the maker locks ZEC</div>
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
                  const totalUSDC = proposal.amount * proposal.price;

                  return (
                    <div
                      key={proposal.id || `proposal-${idx}`}
                      className="border border-green-900/50 bg-green-950/10 rounded-lg p-4"
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
                          <div className="text-xs text-muted-foreground">ZEC Amount</div>
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
                          <div className="text-xs text-muted-foreground">USDC to Lock</div>
                          <div className="text-lg font-semibold text-green-400">
                            ${totalUSDC.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="text-xs text-muted-foreground mb-1">Settlement Status</div>
                        <div className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-950/20 text-green-400 border border-green-900">
                          <CheckCircle className="h-3 w-3" />
                          Alice Locked ZEC - Your Turn
                        </div>
                      </div>

                      <div className="mb-3 p-3 bg-green-950/20 border border-green-900 rounded text-sm">
                        <div className="flex items-center gap-2 mb-2 text-green-400">
                          <AlertCircle className="h-4 w-4" />
                          <span className="font-medium">Alice has locked {proposal.amount} ZEC</span>
                        </div>
                        <div className="text-xs text-green-400/80">
                          You can now safely lock your USDC. The atomic swap ensures you'll receive the ZEC once both sides are locked.
                        </div>
                      </div>

                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleLockUSDC(proposal.id, proposal.amount, proposal.price)}
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
                            Lock ${totalUSDC.toFixed(2)} USDC
                          </>
                        )}
                      </Button>
                      <div className="text-xs text-muted-foreground mt-2 text-center">
                        This will open your Starknet wallet (ArgentX) to sign the HTLC transaction
                      </div>
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
