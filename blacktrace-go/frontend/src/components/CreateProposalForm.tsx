import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { bobAPI } from '../lib/api';
import { useStore } from '../lib/store';
import { Send, DollarSign, X } from 'lucide-react';
import type { Order } from '../lib/types';

interface CreateProposalFormProps {
  order: Order;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateProposalForm({ order, onClose, onSuccess }: CreateProposalFormProps) {
  const [amount, setAmount] = useState(order.amount.toString());
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const user = useStore((state) => state.bob.user);

  // Handle order ID safely
  const orderId = order.id || (order as any).order_id || 'unknown';
  const displayId = typeof orderId === 'string' && orderId.length > 8
    ? orderId.substring(0, 8)
    : String(orderId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!user?.token) {
      setError('Please login first');
      return;
    }

    try {
      setLoading(true);

      await bobAPI.createProposal({
        session_id: user.token,
        order_id: orderId,
        amount: parseFloat(amount),
        price: parseFloat(price),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create proposal');
    } finally {
      setLoading(false);
    }
  };

  const totalValue = parseFloat(amount || '0') * parseFloat(price || '0');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Make Proposal
            </CardTitle>
            <CardDescription>
              Propose terms for Order #{displayId}...
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-muted/30 rounded-md border border-border">
          <div className="text-xs text-muted-foreground mb-2">Order Details</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Amount:</span>
              <span className="ml-2 font-medium">{order.amount} ZEC</span>
            </div>
            <div>
              <span className="text-muted-foreground">For:</span>
              <span className="ml-2 font-medium">{order.stablecoin}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Min Price:</span>
              <span className="ml-2 font-medium">${order.min_price}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Max Price:</span>
              <span className="ml-2 font-medium">${order.max_price}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              ZEC Amount
            </label>
            <Input
              type="number"
              step="0.01"
              placeholder={order.amount.toString()}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Max: {order.amount} ZEC
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Your Price (per ZEC)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                step="0.01"
                placeholder={order.min_price.toString()}
                className="pl-9"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Range: ${order.min_price} - ${order.max_price}
            </p>
          </div>

          {totalValue > 0 && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-md">
              <div className="text-sm">
                <span className="text-muted-foreground">Total Value:</span>
                <span className="ml-2 text-lg font-bold text-primary">
                  ${totalValue.toFixed(2)} {order.stablecoin}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Sending...' : 'Send Proposal'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
