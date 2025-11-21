import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { aliceAPI } from '../lib/api';
import { FileText, Check, RefreshCw } from 'lucide-react';
import type { Proposal } from '../lib/types';

export function ProposalsList() {
  const [orderId, setOrderId] = useState('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchProposals = async () => {
    if (!orderId) {
      setError('Please enter an order ID');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await aliceAPI.getProposalsForOrder(orderId);
      setProposals(response.proposals || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch proposals');
      setProposals([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (proposalId: string) => {
    try {
      await aliceAPI.acceptProposal(proposalId);
      // Refresh proposals after accepting
      fetchProposals();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to accept proposal');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Incoming Proposals
        </CardTitle>
        <CardDescription>
          Review and accept proposals for your orders
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Enter Order ID"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
          <Button onClick={fetchProposals} disabled={loading}>
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              'Load'
            )}
          </Button>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4">
            {error}
          </div>
        )}

        {proposals.length === 0 && orderId && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            No proposals found for this order
          </div>
        )}

        <div className="space-y-3">
          {proposals.map((proposal) => (
            <div
              key={proposal.id}
              className="border border-border rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-mono text-muted-foreground">
                  Proposal #{proposal.id.substring(0, 8)}...
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(proposal.timestamp).toLocaleString()}
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
                    : 'bg-yellow-950/20 text-yellow-400 border border-yellow-900'
                }`}>
                  {proposal.status}
                </div>
              </div>

              {proposal.encrypted && (
                <div className="mb-3 p-2 bg-amber-950/20 border border-amber-900 rounded text-xs text-amber-400">
                  This proposal is encrypted
                </div>
              )}

              {proposal.status === 'pending' && (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => handleAccept(proposal.id)}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Accept Proposal
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
