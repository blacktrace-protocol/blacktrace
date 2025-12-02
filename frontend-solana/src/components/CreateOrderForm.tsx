import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { aliceAPI } from '../lib/api';
import { useStore } from '../lib/store';
import { Coins, TrendingUp, Lock } from 'lucide-react';
import { logWorkflowStart, logWorkflow, logSuccess, logError } from '../lib/logger';

interface User {
  username: string;
  created_at: string;
}

export function CreateOrderForm() {
  const [amount, setAmount] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [stablecoin] = useState('SOL');
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

      logWorkflowStart('ORDER', `New Order: ${amount} ZEC for ${stablecoin}`);
      logWorkflow('ORDER', 'Creating order...', {
        amount: `${amount} ZEC`,
        priceRange: `${minPrice}-${maxPrice} ${stablecoin}`,
        taker: takerUsername || 'Public'
      });

      // Convert amount to zatoshi (1 ZEC = 100,000,000 zatoshi)
      // and prices to lamports per zatoshi (integer representation)
      // For simplicity, we multiply prices by 1e8 to convert to integer lamports-per-ZEC
      const orderData: any = {
        session_id: user.token,
        amount: Math.round(parseFloat(amount) * 100000000), // zatoshi
        stablecoin,
        min_price: Math.round(parseFloat(minPrice) * 1000000000), // lamports (1 SOL = 1e9 lamports)
        max_price: Math.round(parseFloat(maxPrice) * 1000000000), // lamports
      };

      // Only include taker_username if one is selected
      if (takerUsername) {
        orderData.taker_username = takerUsername;
      }

      const response = await aliceAPI.createOrder(orderData);

      logSuccess('ORDER', 'Order created', { orderId: response.order_id.substring(0, 8) + '...' });
      setSuccess(`Order created successfully! ID: ${response.order_id.substring(0, 8)}...`);
      setAmount('');
      setMinPrice('');
      setMaxPrice('');

      // Refresh orders list
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      logError('ORDER', 'Order creation failed', err);
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
          Sell ZEC for SOL with your price range
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
            <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
              <Coins className="h-4 w-4 mr-2 text-purple-400" />
              SOL (Solana)
            </div>
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
                Min Price (SOL per ZEC)
              </label>
              <div className="relative">
                <Coins className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.10"
                  className="pl-9"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Max Price (SOL per ZEC)
              </label>
              <div className="relative">
                <Coins className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.15"
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
