import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { aliceAPI } from '../lib/api';
import { useStore } from '../lib/store';
import { DollarSign, TrendingUp, Lock, Zap } from 'lucide-react';

interface User {
  username: string;
  created_at: string;
}

export function CreateOrderForm() {
  const [amount, setAmount] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [stablecoin, setStablecoin] = useState('STRK');
  const [takerUsername, setTakerUsername] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const user = useStore((state) => state.alice.user);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await aliceAPI.getUsers();
        setUsers(response.users);
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    };
    fetchUsers();
  }, []);

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

      // Convert amount to cents, prices stay as dollars
      const orderData: any = {
        session_id: user.token,
        amount: Math.round(parseFloat(amount) * 100),
        stablecoin,
        min_price: parseFloat(minPrice),
        max_price: parseFloat(maxPrice),
      };

      // Only include taker_username if one is selected
      if (takerUsername) {
        orderData.taker_username = takerUsername;
      }

      const response = await aliceAPI.createOrder(orderData);

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
          Sell ZEC for STRK or stablecoins with your price range
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
              Settlement Asset
            </label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={stablecoin}
              onChange={(e) => setStablecoin(e.target.value)}
            >
              <option value="STRK">STRK (Starknet)</option>
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
              <option value="DAI">DAI</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Specific Taker (Optional - Encrypted)
            </label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={takerUsername}
              onChange={(e) => setTakerUsername(e.target.value)}
            >
              <option value="">Anyone (Public Order)</option>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.username}
                </option>
              ))}
            </select>
            {takerUsername && (
              <div className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900 rounded p-2">
                Order details will be encrypted for {takerUsername} only
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Min Price ({stablecoin === 'STRK' ? 'STRK' : '$'} per ZEC)
              </label>
              <div className="relative">
                {stablecoin === 'STRK' ? (
                  <Zap className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                ) : (
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  type="number"
                  step="0.01"
                  placeholder={stablecoin === 'STRK' ? '10.00' : '25.00'}
                  className="pl-9"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Max Price ({stablecoin === 'STRK' ? 'STRK' : '$'} per ZEC)
              </label>
              <div className="relative">
                {stablecoin === 'STRK' ? (
                  <Zap className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                ) : (
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  type="number"
                  step="0.01"
                  placeholder={stablecoin === 'STRK' ? '15.00' : '30.00'}
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
