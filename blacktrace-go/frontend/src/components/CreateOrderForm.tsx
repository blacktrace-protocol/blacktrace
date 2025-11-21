import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { aliceAPI } from '../lib/api';
import { useStore } from '../lib/store';
import { DollarSign, TrendingUp } from 'lucide-react';

export function CreateOrderForm() {
  const [amount, setAmount] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [stablecoin, setStablecoin] = useState('USDC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const user = useStore((state) => state.alice.user);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!user?.token) {
      setError('Please login first');
      return;
    }

    try {
      setLoading(true);

      const response = await aliceAPI.createOrder({
        session_id: user.token,
        amount: parseFloat(amount),
        stablecoin,
        min_price: parseFloat(minPrice),
        max_price: parseFloat(maxPrice),
      });

      setSuccess(`Order created successfully! ID: ${response.order_id.substring(0, 8)}...`);
      setAmount('');
      setMinPrice('');
      setMaxPrice('');

      // Refresh orders list
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Create OTC Order
        </CardTitle>
        <CardDescription>
          Sell ZEC for stablecoins with your price range
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              ZEC Amount
            </label>
            <Input
              type="number"
              step="0.01"
              placeholder="100.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Stablecoin
            </label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={stablecoin}
              onChange={(e) => setStablecoin(e.target.value)}
            >
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
              <option value="DAI">DAI</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Min Price (per ZEC)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="25.00"
                  className="pl-9"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Max Price (per ZEC)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="30.00"
                  className="pl-9"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2">
              {error}
            </div>
          )}

          {success && (
            <div className="text-sm text-green-400 bg-green-950/20 border border-green-900 rounded-md p-2">
              {success}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating Order...' : 'Create Order'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
