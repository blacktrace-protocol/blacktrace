import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { bobAPI } from '../lib/api';
import { ShoppingCart, DollarSign, RefreshCw, Unlock } from 'lucide-react';
import type { Order } from '../lib/types';
import { logWorkflow, logSuccess, logError } from '../lib/logger';

interface OrdersListProps {
  onSelectOrder: (order: Order) => void;
  onCountChange?: (count: number) => void;
}

export function OrdersList({ onSelectOrder, onCountChange }: OrdersListProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestingDetails, setRequestingDetails] = useState<Set<string>>(new Set());

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await bobAPI.getOrders();

      // Filter out orders that have accepted proposals
      const ordersWithoutAccepted = await Promise.all(
        data.map(async (order) => {
          try {
            const response = await bobAPI.getProposalsForOrder(order.id);
            const hasAccepted = response.proposals.some(p => p.status === 'accepted');
            return hasAccepted ? null : order;
          } catch {
            // If we can't fetch proposals, keep the order
            return order;
          }
        })
      );

      // Filter out null values and sort by timestamp (latest first)
      const filteredOrders = ordersWithoutAccepted
        .filter(order => order !== null) as Order[];
      const sortedOrders = filteredOrders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      setOrders(sortedOrders);
      onCountChange?.(sortedOrders.length);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch orders');
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDetails = async (orderId: string) => {
    logWorkflow('ORDER', 'Requesting encrypted order details...', { orderId: orderId.substring(0, 8) + '...' });
    try {
      setRequestingDetails(prev => new Set(prev).add(orderId));
      setError('');
      await bobAPI.requestOrderDetails(orderId);
      logSuccess('ORDER', 'Details request sent via P2P', { orderId: orderId.substring(0, 8) + '...' });
      // Details will arrive via P2P and appear in the next poll
    } catch (err: any) {
      logError('ORDER', 'Failed to request details', err);
      setError(err.response?.data?.error || 'Failed to request order details');
    } finally {
      setRequestingDetails(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  useEffect(() => {
    fetchOrders();
    // Poll every 5 seconds
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Available Orders
            </CardTitle>
            <CardDescription>
              Browse and respond to OTC orders
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchOrders}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4">
            {error}
          </div>
        )}

        {orders.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            No orders available. Waiting for Alice to create an order...
          </div>
        )}

        <div className="space-y-3">
          {orders.map((order, index) => {
            const orderId = order.id || `order-${index}`;

            // Convert Unix seconds to milliseconds for JavaScript Date
            const timestamp = order.timestamp ? new Date(order.timestamp * 1000) : null;

            return (
              <div
                key={orderId}
                className="border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
              >
                <div className="mb-3 pb-2 border-b border-border">
                  <div className="text-xs text-muted-foreground mb-1">Order ID</div>
                  <div className="font-mono text-xs break-all text-primary">
                    {orderId}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {timestamp ? timestamp.toLocaleString() : 'N/A'}
                  </div>
                </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <div className="text-xs text-muted-foreground">Amount</div>
                  <div className="text-lg font-semibold">
                    {order.amount === 0 ? '???' : (order.amount / 100).toFixed(2)} ZEC
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">For</div>
                  <div className="text-lg font-semibold">
                    {order.stablecoin}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 mb-3">
                <div className="flex items-center gap-1 text-sm">
                  <DollarSign className="h-3 w-3" />
                  <span className="text-muted-foreground">Min:</span>
                  <span className="font-medium">${order.amount === 0 ? '???' : (order.min_price || 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <DollarSign className="h-3 w-3" />
                  <span className="text-muted-foreground">Max:</span>
                  <span className="font-medium">${order.amount === 0 ? '???' : (order.max_price || 0).toFixed(2)}</span>
                </div>
              </div>

              {order.amount === 0 ? (
                <div className="space-y-2">
                  <div className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded p-2">
                    Order details are encrypted. Request details to view and make a proposal.
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    variant="outline"
                    onClick={() => handleRequestDetails(orderId)}
                    disabled={requestingDetails.has(orderId)}
                  >
                    <Unlock className="h-4 w-4 mr-1" />
                    {requestingDetails.has(orderId) ? 'Requesting...' : 'Request Details'}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => onSelectOrder(order)}
                >
                  Make Proposal
                </Button>
              )}
            </div>
          );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
