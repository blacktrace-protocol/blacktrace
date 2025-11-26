import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { aliceAPI, bobAPI } from '../lib/api';
import { CheckCircle, RefreshCw, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import type { Proposal } from '../lib/types';

export function SettlementQueue() {
  const [acceptedProposals, setAcceptedProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(true);

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
            .filter(p =>
              p.status === 'accepted' &&
              p.settlement_status === 'both_locked' &&
              p.id &&
              p.id.trim() !== ''
            )
            .map(p => ({
              ...p,
              orderID: order.id, // Ensure orderID is set
            }));

          accepted.push(...orderAccepted);
        } catch (err) {
          console.error(`Failed to fetch proposals for ${order.id}:`, err);
        }
      }

      // Group proposals by orderID and keep only the latest one per order
      const proposalsByOrderID = new Map<string, Proposal>();

      for (const proposal of accepted) {
        const orderID = proposal.orderID;
        if (!orderID) continue;

        const existing = proposalsByOrderID.get(orderID);
        if (!existing) {
          proposalsByOrderID.set(orderID, proposal);
        } else {
          // Compare timestamps and keep the latest
          const existingTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
          const proposalTime = proposal.timestamp ? new Date(proposal.timestamp).getTime() : 0;

          if (proposalTime > existingTime) {
            proposalsByOrderID.set(orderID, proposal);
          }
        }
      }

      // Convert map to array and sort by timestamp (latest first)
      const uniqueAccepted = Array.from(proposalsByOrderID.values()).sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });

      setAcceptedProposals(uniqueAccepted);
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
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-green-500" />
          Settlement Queue
          <span className="ml-1.5 px-2 py-0.5 text-sm font-bold bg-primary text-primary-foreground rounded">
            {acceptedProposals.length}
          </span>
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          <span className="ml-auto">
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
        </CardTitle>
        <CardDescription>
          Both assets locked - ready for claiming • Auto-refreshing every 5 seconds
        </CardDescription>
      </CardHeader>
      {!isCollapsed && (<CardContent>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4">
            {error}
          </div>
        )}

        {acceptedProposals.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <div>No fully locked proposals yet</div>
            <div className="text-xs mt-1">Proposals will appear here once both Alice and Bob have locked their assets</div>
          </div>
        )}

        <div className="space-y-3">
          {acceptedProposals.map((proposal, idx) => (
            <div
              key={proposal.id || `proposal-${idx}`}
              className="border border-green-900/50 bg-green-950/10 rounded-lg p-4"
            >
              <div className="mb-3 border-b border-border pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div className="text-sm font-medium text-muted-foreground">Accepted Proposal</div>
                  <div className="text-xs text-muted-foreground ml-auto">
                    {proposal.timestamp ? new Date(proposal.timestamp).toLocaleString() : 'N/A'}
                  </div>
                </div>
                <div className="space-y-2 ml-7">
                  <div>
                    <div className="text-xs text-muted-foreground">Proposal ID</div>
                    <div className="font-mono text-xs break-all text-primary">
                      {proposal.id || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">For Order</div>
                    <div className="font-mono text-xs break-all text-primary">
                      {proposal.orderID || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <div className="text-xs text-muted-foreground">Amount</div>
                  <div className="text-base font-semibold">
                    {(proposal.amount / 100).toFixed(2)} ZEC
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
                    ${(proposal.amount / 100 * proposal.price).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-green-950/30 border border-green-900 rounded text-xs">
                <Zap className="h-4 w-4 text-green-500" />
                <span className="text-green-400">Both assets locked - Settlement service will coordinate claim process</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>)}
    </Card>
  );
}
