import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Wallet, RefreshCw } from 'lucide-react';

interface WalletBalanceProps {
  user: 'alice' | 'bob';
}

interface BalanceData {
  address: string;
  balance: number;
}

export function WalletBalance({ user }: WalletBalanceProps) {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchBalance = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`http://localhost:8090/api/${user}/balance`);
      if (!response.ok) {
        throw new Error('Failed to fetch balance');
      }

      const data = await response.json();
      setBalance(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    // Auto-refresh every 3 seconds
    const interval = setInterval(fetchBalance, 3000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          ZEC Wallet Balance
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Auto-refreshing every 3 seconds
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4">
            {error}
          </div>
        )}

        {balance && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Available Balance</div>
              <div className="text-3xl font-bold text-primary">
                {balance.balance.toFixed(8)} ZEC
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Wallet Address</div>
              <div className="font-mono text-xs break-all bg-muted/30 rounded p-2">
                {balance.address}
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-blue-950/20 border border-blue-900 rounded p-2">
              💡 Balance updates automatically as you lock/unlock funds in HTLCs
            </div>
          </div>
        )}

        {!balance && !error && loading && (
          <div className="text-center py-8 text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <div>Loading wallet balance...</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
