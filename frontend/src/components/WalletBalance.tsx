import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Wallet, RefreshCw, Coins, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { useStore } from '../lib/store';

interface WalletBalanceProps {
  user: 'alice' | 'bob';
}

interface WalletInfo {
  username: string;
  zcash_address: string;
  balance: number;
  total_funded: number;
  funding_count: number;
}

type FundingStatus = 'idle' | 'requesting' | 'confirming' | 'completed' | 'error';

export function WalletBalance({ user }: WalletBalanceProps) {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fundingStatus, setFundingStatus] = useState<FundingStatus>('idle');
  const [fundingMessage, setFundingMessage] = useState('');

  // Get username from store
  const currentUser = useStore((state) => user === 'alice' ? state.alice.user : state.bob.user);
  const username = currentUser?.username;

  const port = user === 'alice' ? 8080 : 8081;
  const maxFunding = 100;
  const fundAmountPerRequest = 10;

  const fetchWalletInfo = async () => {
    if (!username) return;

    try {
      setLoading(true);
      setError('');

      const response = await fetch(`http://localhost:${port}/wallet/info?username=${username}`);
      if (!response.ok) {
        throw new Error('Failed to fetch wallet info');
      }

      const data = await response.json();
      setWalletInfo(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch wallet info');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestFunds = async () => {
    if (!username) return;

    setFundingStatus('requesting');
    setFundingMessage('Requesting funds from faucet...');
    setError('');

    try {
      const response = await fetch(`http://localhost:${port}/wallet/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to request funds');
      }

      const result = await response.json();

      // Show confirmation step
      setFundingStatus('confirming');
      setFundingMessage('Transaction sent! Mining block for confirmation...');

      // Wait a moment to simulate block mining (already done on backend)
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Show success
      setFundingStatus('completed');
      setFundingMessage(`Successfully received ${result.amount} ZEC!`);

      // Refresh wallet info to show new balance
      await fetchWalletInfo();

      // Reset to idle after showing success message
      setTimeout(() => {
        setFundingStatus('idle');
        setFundingMessage('');
      }, 3000);
    } catch (err: any) {
      setFundingStatus('error');
      setError(err.message || 'Failed to request funds');
      setTimeout(() => {
        setFundingStatus('idle');
      }, 3000);
    }
  };

  useEffect(() => {
    if (!username) return;

    fetchWalletInfo();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchWalletInfo, 5000);
    return () => clearInterval(interval);
  }, [username, user]);

  if (!username) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            ZEC Wallet Balance
          </CardTitle>
          <CardDescription>
            Sign in to view your wallet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <div>Please sign in to view your wallet</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const remaining = walletInfo ? maxFunding - walletInfo.total_funded : maxFunding;
  const canRequestMore = remaining >= fundAmountPerRequest;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          ZEC Wallet Balance
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Auto-refreshing every 5 seconds
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && fundingStatus !== 'requesting' && fundingStatus !== 'confirming' && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-3 mb-4 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {walletInfo && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Available Balance</div>
              <div className="text-3xl font-bold text-primary">
                {walletInfo.balance.toFixed(8)} ZEC
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Wallet Address</div>
              <div className="font-mono text-xs break-all bg-muted/30 rounded p-2">
                {walletInfo.zcash_address}
              </div>
            </div>

            {/* Funding Status Messages */}
            {fundingStatus === 'requesting' && (
              <div className="bg-blue-950/20 border border-blue-900 rounded-md p-3">
                <div className="flex items-center gap-2 text-blue-400">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">{fundingMessage}</span>
                </div>
              </div>
            )}

            {fundingStatus === 'confirming' && (
              <div className="bg-amber-950/20 border border-amber-900 rounded-md p-3">
                <div className="flex items-center gap-2 text-amber-400">
                  <Clock className="h-4 w-4 animate-pulse" />
                  <span className="text-sm font-medium">{fundingMessage}</span>
                </div>
              </div>
            )}

            {fundingStatus === 'completed' && (
              <div className="bg-green-950/20 border border-green-900 rounded-md p-3">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">{fundingMessage}</span>
                </div>
              </div>
            )}

            {/* Request Funds Button */}
            <div className="space-y-2">
              <Button
                onClick={handleRequestFunds}
                disabled={!canRequestMore || fundingStatus === 'requesting' || fundingStatus === 'confirming'}
                className="w-full"
                variant={canRequestMore ? "default" : "secondary"}
              >
                {fundingStatus === 'requesting' || fundingStatus === 'confirming' ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Coins className="h-4 w-4 mr-2" />
                    Request {fundAmountPerRequest} ZEC
                  </>
                )}
              </Button>

              <div className="text-xs text-center space-y-1">
                {canRequestMore ? (
                  <>
                    <div className="text-muted-foreground">
                      Testnet faucet: {walletInfo.total_funded.toFixed(1)} / {maxFunding} ZEC used
                    </div>
                    <div className="text-blue-400">
                      You can request {remaining.toFixed(1)} ZEC more
                    </div>
                  </>
                ) : (
                  <div className="text-amber-400">
                    Funding limit reached ({maxFunding} ZEC maximum)
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-blue-950/20 border border-blue-900 rounded p-2">
              💡 Balance updates automatically as you lock/unlock funds in HTLCs
            </div>
          </div>
        )}

        {!walletInfo && !error && loading && (
          <div className="text-center py-8 text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <div>Loading wallet balance...</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
