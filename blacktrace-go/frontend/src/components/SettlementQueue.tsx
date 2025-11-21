import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { aliceAPI, bobAPI } from '../lib/api';
import { CheckCircle, RefreshCw, Zap } from 'lucide-react';
import type { Proposal, Order } from '../lib/types';

export function SettlementQueue() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [acceptedProposals, setAcceptedProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAcceptedProposals = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch all orders from both Alice and Bob
      const [aliceOrders, bobOrders] = await Promise.all([
        aliceAPI.getOrders().catch(() => []),
        bobAPI.getOrders().catch(() => []),
      ]);

      // Combine and deduplicate orders
      const allOrders = [...aliceOrders, ...bobOrders];
      const uniqueOrders = Array.from(
        new Map(allOrders.map(order => [order.id, order])).values()
      );
      setOrders(uniqueOrders);

      // Fetch proposals for each order and filter accepted ones
      const accepted: Proposal[] = [];
      for (const order of uniqueOrders) {
        try {
          const [aliceResponse, bobResponse] = await Promise.all([
            aliceAPI.getProposalsForOrder(order.id).catch(() => ({ proposals: [] })),
            bobAPI.getProposalsForOrder(order.id).catch(() => ({ proposals: [] })),
          ]);

          // Combine proposals from both sides
          const allProposals = [
            ...aliceResponse.proposals,
            ...bobResponse.proposals,
          ];

          // Deduplicate by ID and filter accepted proposals
          const uniqueProposals = Array.from(
            new Map(allProposals.map(p => [p.id, p])).values()
          );

          const orderAccepted = uniqueProposals
            .filter(p => p.status === 'accepted' && p.id && p.id.trim() !== '')
            .map(p => ({
              ...p,
              orderID: order.id, // Ensure orderID is set
            }));

          accepted.push(...orderAccepted);
        } catch (err) {
          console.error(`Failed to fetch proposals for ${order.id}:`, err);
        }
      }

      // Sort by timestamp (latest first)
      const sortedAccepted = accepted.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });

      setAcceptedProposals(sortedAccepted);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch settlement queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAcceptedProposals();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchAcceptedProposals, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-green-500" />
          Settlement Queue
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Accepted proposals ready for settlement • Auto-refreshing every 5 seconds
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4">
            {error}
          </div>
        )}

        {acceptedProposals.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <div>No accepted proposals yet</div>
            <div className="text-xs mt-1">Accepted proposals will appear here and wait for settlement processing</div>
          </div>
        )}

        <div className="space-y-3">
          {acceptedProposals.map((proposal, idx) => (
            <div
              key={proposal.id || `proposal-${idx}`}
              className="border border-green-900/50 bg-green-950/10 rounded-lg p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="text-sm font-medium">Proposal #{proposal.id ? proposal.id.substring(0, 8) : 'N/A'}...</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Order: {proposal.orderID?.substring(0, 12)}...
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {proposal.timestamp ? new Date(proposal.timestamp).toLocaleString() : 'N/A'}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <div className="text-xs text-muted-foreground">Amount</div>
                  <div className="text-base font-semibold">
                    {proposal.amount} ZEC
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Price</div>
                  <div className="text-base font-semibold">
                    ${proposal.price}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Value</div>
                  <div className="text-base font-semibold text-green-400">
                    ${(proposal.amount * proposal.price).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-green-950/30 border border-green-900 rounded text-xs">
                <Zap className="h-4 w-4 text-green-500" />
                <span className="text-green-400">Waiting for settlement service (NATS)</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
