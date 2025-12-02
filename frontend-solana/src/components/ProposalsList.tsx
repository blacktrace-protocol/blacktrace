import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { aliceAPI } from '../lib/api';
import { FileText, Check, RefreshCw, Key } from 'lucide-react';
import type { Proposal, Order } from '../lib/types';
import { logWorkflowStart, logWorkflow, logStateChange, logSuccess, logError } from '../lib/logger';

interface ProposalsListProps {
  onCountChange?: (count: number) => void;
}

export function ProposalsList({ onCountChange }: ProposalsListProps = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [proposalsByOrder, setProposalsByOrder] = useState<Record<string, Proposal[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Secret input for each proposal (keyed by proposal ID)
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [acceptingProposal, setAcceptingProposal] = useState<string | null>(null);

  const fetchOrdersAndProposals = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch all orders and sort by timestamp (latest first)
      const ordersData = await aliceAPI.getOrders();
      const sortedOrders = ordersData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setOrders(sortedOrders);

      // Fetch proposals for each order
      const proposalsMap: Record<string, Proposal[]> = {};
      for (const order of sortedOrders) {
        try {
          const response = await aliceAPI.getProposalsForOrder(order.id);
          if (response.proposals && response.proposals.length > 0) {
            // Filter out proposals without IDs, accepted proposals, rejected proposals, and sort by timestamp (latest first)
            const validProposals = response.proposals
              .filter(p => p.id && p.id.trim() !== '' && p.status !== 'accepted' && p.status !== 'rejected')
              .sort((a, b) => {
                const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timeB - timeA;
              });
            if (validProposals.length > 0) {
              proposalsMap[order.id] = validProposals;
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
    fetchOrdersAndProposals();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchOrdersAndProposals, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAccept = async (proposalId: string) => {
    const secret = secrets[proposalId];
    if (!secret || secret.length < 8) {
      setError('Please enter a secret (minimum 8 characters). This secret will be used for the HTLC - save it!');
      return;
    }

    try {
      setAcceptingProposal(proposalId);
      setError('');
      logWorkflowStart('PROPOSAL', 'Accepting Proposal');
      logWorkflow('PROPOSAL', 'Processing acceptance with secret...', { proposalId: proposalId.substring(0, 8) + '...' });
      await aliceAPI.acceptProposal(proposalId, secret);
      logStateChange('PROPOSAL', 'pending', 'accepted', proposalId.substring(0, 8) + '...');
      logSuccess('PROPOSAL', 'Proposal accepted - Ready for settlement');
      // Clear the secret input after successful acceptance
      setSecrets(prev => {
        const newSecrets = { ...prev };
        delete newSecrets[proposalId];
        return newSecrets;
      });
      // Refresh proposals after accepting
      fetchOrdersAndProposals();
    } catch (err: any) {
      logError('PROPOSAL', 'Accept failed', err);
      setError(err.response?.data?.error || 'Failed to accept proposal');
    } finally {
      setAcceptingProposal(null);
    }
  };

  const handleReject = async (proposalId: string) => {
    try {
      logWorkflow('PROPOSAL', 'Rejecting proposal...', { proposalId: proposalId.substring(0, 8) + '...' });
      await aliceAPI.rejectProposal(proposalId);
      logStateChange('PROPOSAL', 'pending', 'rejected', proposalId.substring(0, 8) + '...');
      // Refresh proposals after rejecting
      fetchOrdersAndProposals();
    } catch (err: any) {
      logError('PROPOSAL', 'Reject failed', err);
      setError(err.response?.data?.error || 'Failed to reject proposal');
    }
  };

  // Count total proposals
  const totalProposals = Object.values(proposalsByOrder).reduce((acc, proposals) => acc + proposals.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Incoming Proposals
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Auto-refreshing every 5 seconds • {totalProposals} proposal{totalProposals !== 1 ? 's' : ''} across {orders.length} order{orders.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4">
            {error}
          </div>
        )}

        {orders.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            No orders yet. Create an order to receive proposals.
          </div>
        )}

        {totalProposals === 0 && orders.length > 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            No proposals received yet. Waiting for takers...
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
                    Order ID (Full)
                  </div>
                  <div className="font-mono text-xs break-all text-primary">
                    {order.id}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {proposals.length} proposal{proposals.length !== 1 ? 's' : ''}
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
                          {(proposal.amount / 100000000).toFixed(4)} ZEC
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Price</div>
                        <div className="text-lg font-semibold">
                          {(proposal.price / 1000000000).toFixed(4)} SOL
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Total</div>
                        <div className="text-lg font-semibold text-primary">
                          {((proposal.amount / 100000000) * (proposal.price / 1000000000)).toFixed(4)} SOL
                        </div>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="text-xs text-muted-foreground mb-1">Status</div>
                      <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                        proposal.status?.toLowerCase() === 'accepted'
                          ? 'bg-green-950/20 text-green-400 border border-green-900'
                          : proposal.status?.toLowerCase() === 'rejected'
                          ? 'bg-red-950/20 text-red-400 border border-red-900'
                          : 'bg-yellow-950/20 text-yellow-400 border border-yellow-900'
                      }`}>
                        {proposal.status || 'pending'}
                      </div>
                    </div>

                    {proposal.encrypted && (
                      <div className="mb-3 p-2 bg-amber-950/20 border border-amber-900 rounded text-xs text-amber-400">
                        This proposal is encrypted
                      </div>
                    )}

                    {(!proposal.status || proposal.status?.toLowerCase() === 'pending') && (
                      <div className="space-y-3">
                        <div className="p-3 bg-amber-950/20 border border-amber-900 rounded">
                          <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-2">
                            <Key className="h-4 w-4" />
                            Create HTLC Secret
                          </div>
                          <Input
                            type="text"
                            placeholder="Enter a secret phrase (min 8 chars) - SAVE THIS!"
                            value={secrets[proposal.id] || ''}
                            onChange={(e) => setSecrets(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                            disabled={acceptingProposal === proposal.id}
                            className="font-mono mb-2"
                          />
                          <div className="text-xs text-amber-400/70">
                            This secret will be used for the HTLC. Bob will need it to claim ZEC after you claim SOL.
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              if (!proposal.id) {
                                setError('Proposal ID missing - cannot accept');
                                return;
                              }
                              handleAccept(proposal.id);
                            }}
                            disabled={acceptingProposal === proposal.id || !secrets[proposal.id] || secrets[proposal.id].length < 8}
                          >
                            {acceptingProposal === proposal.id ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                Accepting...
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Accept with Secret
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              if (!proposal.id) {
                                setError('Proposal ID missing - cannot reject');
                                return;
                              }
                              handleReject(proposal.id);
                            }}
                            disabled={acceptingProposal === proposal.id}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}

                    {proposal.status?.toLowerCase() === 'accepted' && (
                      <div className="p-3 bg-green-950/20 border border-green-900 rounded text-sm text-green-400">
                        ✓ Accepted - Ready for settlement
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
