import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { bobAPI } from '../lib/api';
import { FileText, RefreshCw, Edit2 } from 'lucide-react';
import type { Proposal, Order } from '../lib/types';

interface MyProposalsProps {
  onEditProposal: (order: Order, proposal: Proposal) => void;
  onCountChange?: (count: number) => void;
}

export function MyProposals({ onEditProposal, onCountChange }: MyProposalsProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [proposalsByOrder, setProposalsByOrder] = useState<Record<string, Proposal[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchMyProposals = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch all orders and sort by timestamp (latest first)
      const ordersData = await bobAPI.getOrders();
      const sortedOrders = ordersData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setOrders(sortedOrders);

      // Fetch proposals for each order
      const proposalsMap: Record<string, Proposal[]> = {};
      for (const order of sortedOrders) {
        try {
          const response = await bobAPI.getProposalsForOrder(order.id);
          if (response.proposals && response.proposals.length > 0) {
            // Check if any proposal for this order is accepted
            const hasAcceptedProposal = response.proposals.some(p => p.status === 'accepted');

            // If order has an accepted proposal, skip it entirely (don't show any proposals for this order)
            if (hasAcceptedProposal) {
              continue;
            }

            // Filter out proposals without IDs, accepted proposals, and sort by timestamp (latest first)
            const validProposals = response.proposals
              .filter(p => p.id && p.id.trim() !== '' && p.status !== 'accepted')
              .sort((a, b) => {
                const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timeB - timeA;
              });

            // Show only the most recent proposal per order (to avoid showing old rejected proposals after resubmit)
            if (validProposals.length > 0) {
              proposalsMap[order.id] = [validProposals[0]]; // Take only the first (most recent) proposal
            }
          }
        } catch (err) {
          // Ignore errors for individual orders
          console.error(`Failed to fetch proposals for ${order.id}:`, err);
        }
      }
      setProposalsByOrder(proposalsMap);
      // Count total proposals
      const totalCount = Object.values(proposalsMap).reduce((acc, proposals) => acc + proposals.length, 0);
      onCountChange?.(totalCount);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch proposals');
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyProposals();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchMyProposals, 5000);
    return () => clearInterval(interval);
  }, []);

  // Count total proposals
  const totalProposals = Object.values(proposalsByOrder).reduce((acc, proposals) => acc + proposals.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          My Proposals
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Auto-refreshing every 5 seconds • {totalProposals} proposal{totalProposals !== 1 ? 's' : ''} submitted
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
            No proposals submitted yet. Make a proposal on an order to see it here.
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

                {proposals.map((proposal, idx) => (
                  <div
                    key={proposal.id || `proposal-${idx}`}
                    className="border border-border rounded-lg p-4"
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
                      <div className="text-xs text-muted-foreground mb-1">Status</div>
                      <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                        proposal.status === 'accepted'
                          ? 'bg-green-950/20 text-green-400 border border-green-900'
                          : proposal.status === 'rejected'
                          ? 'bg-red-950/20 text-red-400 border border-red-900'
                          : 'bg-yellow-950/20 text-yellow-400 border border-yellow-900'
                      }`}>
                        {proposal.status || 'pending'}
                      </div>
                    </div>

                    {proposal.status === 'rejected' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => onEditProposal(order, proposal)}
                      >
                        <Edit2 className="h-4 w-4 mr-1" />
                        Edit & Resubmit
                      </Button>
                    )}

                    {proposal.status === 'accepted' && (
                      <div className="p-2 bg-green-950/20 border border-green-900 rounded text-xs text-green-400">
                        ✓ This proposal has been accepted by the maker
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
