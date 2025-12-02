import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Wallet, RefreshCw, Coins, CheckCircle, Clock, AlertTriangle, Zap } from 'lucide-react';
import { useStore } from '../lib/store';
import { useMakerStarknet, useTakerStarknet } from '../lib/starknet';
import { Account, RpcProvider, CallData } from 'starknet';

// Devnet faucet for STRK funding (using 3rd pre-deployed account, not Alice or Bob)
const FAUCET_ACCOUNT = {
  address: '0x49dfb8ce986e21d354ac93ea65e6a11f639c1934ea253e5ff14ca62eca0f38e',
  privateKey: '0xa20a02f0ac53692d144b20cb371a60d7',
};
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';

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
  const [strkFunding, setStrkFunding] = useState(false);
  const [strkFundingSuccess, setStrkFundingSuccess] = useState<string | null>(null);

  // Get username from store
  const currentUser = useStore((state) => user === 'alice' ? state.alice.user : state.bob.user);
  const username = currentUser?.username;

  // Get Starknet context based on user
  const makerStarknet = useMakerStarknet();
  const takerStarknet = useTakerStarknet();
  const starknetContext = user === 'alice' ? makerStarknet : takerStarknet;
  const { address: starknetAddress, balance: strkBalance, connectWallet: connectStarknet } = starknetContext;

  const port = user === 'alice' ? 8080 : 8081;
  const maxFunding = 100;
  const fundAmountPerRequest = 10;

  const fetchWalletInfo = useCallback(async () => {
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
  }, [username, port]);

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

  // Fund STRK from devnet faucet
  const handleFundSTRK = async (amount: number) => {
    if (!starknetAddress) {
      setError('Please wait for Starknet wallet to connect');
      return;
    }

    setStrkFunding(true);
    setError('');
    setStrkFundingSuccess(null);

    try {
      const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });
      const faucetAccount = new Account(
        provider,
        FAUCET_ACCOUNT.address,
        FAUCET_ACCOUNT.privateKey
      );

      // Convert amount to wei (18 decimals)
      const amountWei = BigInt(amount) * BigInt(10 ** 18);
      const amountLow = amountWei & ((1n << 128n) - 1n);
      const amountHigh = amountWei >> 128n;

      // Transfer STRK from faucet to connected wallet
      const tx = await faucetAccount.execute({
        contractAddress: STRK_TOKEN_ADDRESS,
        entrypoint: 'transfer',
        calldata: CallData.compile({
          recipient: starknetAddress,
          amount: { low: amountLow, high: amountHigh },
        }),
      });

      await provider.waitForTransaction(tx.transaction_hash);

      setStrkFundingSuccess(`Successfully funded ${amount} STRK!`);

      // Refresh balance by reconnecting with the correct user role
      setTimeout(async () => {
        try {
          await connectStarknet(user);
          console.log(`Refreshed ${user} STRK balance after funding`);
        } catch (err) {
          console.error('Failed to refresh balance:', err);
        }
        setStrkFundingSuccess(null);
      }, 2000);
    } catch (err: any) {
      console.error('STRK funding failed:', err);
      setError(err.message || 'Failed to fund STRK');
    } finally {
      setStrkFunding(false);
    }
  };

  // Auto-connect Starknet wallet
  useEffect(() => {
    if (!starknetAddress && username) {
      connectStarknet(user).catch(console.error);
    }
  }, [username, user, starknetAddress]);

  useEffect(() => {
    if (!username) return;

    fetchWalletInfo();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchWalletInfo, 5000);
    return () => clearInterval(interval);
  }, [username, fetchWalletInfo]);

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
          Wallet Balances
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          ZEC &amp; STRK balances • Auto-refreshing
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

            {/* Divider */}
            <div className="border-t border-border my-4" />

            {/* STRK Balance Section */}
            <div className="bg-purple-950/20 border border-purple-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-400" />
                  <span className="text-sm font-medium text-purple-400">STRK Balance</span>
                </div>
                <div className="text-xl font-bold text-purple-400">
                  {strkBalance || '...'} STRK
                </div>
              </div>

              {starknetAddress && (
                <div className="mb-3">
                  <div className="text-xs text-muted-foreground mb-1">Starknet Address</div>
                  <div className="font-mono text-xs break-all bg-purple-950/30 rounded p-2 text-purple-300">
                    {starknetAddress}
                  </div>
                </div>
              )}

              {/* STRK Funding Buttons */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleFundSTRK(500)}
                  disabled={strkFunding}
                  className="flex-1 border-purple-900 text-purple-400 hover:bg-purple-950/30"
                >
                  {strkFunding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Coins className="h-3 w-3 mr-1" />+500</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleFundSTRK(1000)}
                  disabled={strkFunding}
                  className="flex-1 border-purple-900 text-purple-400 hover:bg-purple-950/30"
                >
                  {strkFunding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Coins className="h-3 w-3 mr-1" />+1000</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleFundSTRK(2000)}
                  disabled={strkFunding}
                  className="flex-1 border-purple-900 text-purple-400 hover:bg-purple-950/30"
                >
                  {strkFunding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Coins className="h-3 w-3 mr-1" />+2000</>}
                </Button>
              </div>

              {strkFundingSuccess && (
                <div className="text-xs text-green-400 mt-2">✅ {strkFundingSuccess}</div>
              )}

              <div className="text-xs text-muted-foreground mt-2">
                Fund STRK from Starknet devnet faucet for testing
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-blue-950/20 border border-blue-900 rounded p-2">
              💡 Balances update automatically as you lock/unlock funds in HTLCs
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
