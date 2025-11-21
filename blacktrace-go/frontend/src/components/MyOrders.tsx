import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { aliceAPI } from '../lib/api';
import { ClipboardList, DollarSign, RefreshCw } from 'lucide-react';
import type { Order } from '../lib/types';

export function MyOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await aliceAPI.getOrders();
      setOrders(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch orders');
    } finally {
      setLoading(false);
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
              <ClipboardList className="h-5 w-5" />
              My Orders
            </CardTitle>
            <CardDescription>
              View your created orders and their status
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
            No orders created yet. Create your first order to get started!
          </div>
        )}

        <div className="space-y-3">
          {orders.map((order, index) => {
            const orderId = order.id || `order-${index}`;
            const displayId = typeof orderId === 'string' && orderId.length > 12
              ? orderId.substring(0, 12)
              : String(orderId);

            // Convert Unix seconds to milliseconds for JavaScript Date
            const timestamp = order.timestamp ? new Date(order.timestamp * 1000) : null;
            const expiry = order.expiry ? new Date(order.expiry * 1000) : null;

            return (
              <div
                key={orderId}
                className="border border-border rounded-lg p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-mono text-muted-foreground">
                    Order #{displayId}...
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {timestamp ? timestamp.toLocaleString() : 'N/A'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Amount</div>
                    <div className="text-lg font-semibold">
                      {order.amount} ZEC
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
                    <span className="font-medium">${order.min_price || 0}</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm">
                    <DollarSign className="h-3 w-3" />
                    <span className="text-muted-foreground">Max:</span>
                    <span className="font-medium">${order.max_price || 0}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="text-muted-foreground">
                    Type: <span className="text-foreground font-medium">{order.order_type}</span>
                  </div>
                  {expiry && (
                    <div className="text-muted-foreground">
                      Expires: <span className="text-foreground">{expiry.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 p-2 bg-primary/10 border border-primary/20 rounded-md text-xs">
                  <span className="text-muted-foreground">Total Value Range: </span>
                  <span className="font-semibold text-primary">
                    ${(order.amount * order.min_price).toFixed(2)} - ${(order.amount * order.max_price).toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
