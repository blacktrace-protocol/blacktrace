import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useMakerStarknet, useTakerStarknet, type HTLCDetails } from '../lib/starknet';
import { Loader2, Lock, Unlock, RefreshCw, Coins } from 'lucide-react';
import { Account, RpcProvider, CallData } from 'starknet';

// Devnet faucet account (account 0 has large balance)
const FAUCET_ACCOUNT = {
  address: '0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691',
  privateKey: '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9',
};
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';

interface StarknetHTLCProps {
  panel: 'maker' | 'taker';
}

export const StarknetHTLC: React.FC<StarknetHTLCProps> = ({ panel }) => {
  const useStarknet = panel === 'maker' ? useMakerStarknet : useTakerStarknet;
  const { account, address, role, balance, connectWallet, disconnectWallet, getHTLCDetails, lockFunds, claimFunds } = useStarknet();

  const [htlcDetails, setHtlcDetails] = useState<HTLCDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lock form state
  const [secret, setSecret] = useState('');
  const [receiver, setReceiver] = useState('0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1');
  const [amount, setAmount] = useState('1000');
  const [timeoutMinutes, setTimeoutMinutes] = useState('60');

  // Claim form state
  const [claimSecret, setClaimSecret] = useState('');
  const [claimHashLock, setClaimHashLock] = useState('');
  const [queryHashLock, setQueryHashLock] = useState('');

  // Funding state
  const [funding, setFunding] = useState(false);
  const [fundingSuccess, setFundingSuccess] = useState<string | null>(null);

  // Fund STRK from faucet (devnet only)
  const handleFundSTRK = async (amount: number) => {
    if (!address) return;

    setFunding(true);
    setError(null);
    setFundingSuccess(null);

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
          recipient: address,
          amount: { low: amountLow, high: amountHigh },
        }),
      });

      await provider.waitForTransaction(tx.transaction_hash);

      // Show success message
      setFundingSuccess(`Successfully funded ${amount} STRK!`);

      // Trigger balance refresh by reconnecting (hack but works)
      setTimeout(async () => {
        if (role) {
          await connectWallet(role);
        }
        setFundingSuccess(null);
      }, 2000);
    } catch (err: any) {
      console.error('Funding failed:', err);
      setError(err.message || 'Failed to fund STRK');
    } finally {
      setFunding(false);
    }
  };

  useEffect(() => {
    if (account) {
      loadHTLCDetails();
      const interval = setInterval(loadHTLCDetails, 5000);
      return () => clearInterval(interval);
    }
  }, [account]);

  const loadHTLCDetails = async () => {
    if (!queryHashLock) return; // Need hash_lock to query
    try {
      const details = await getHTLCDetails(queryHashLock);
      setHtlcDetails(details);
    } catch (err) {
      console.error('Failed to load HTLC details:', err);
    }
  };

  const handleConnect = async (selectedRole: 'bob' | 'alice') => {
    setError(null);
    setLoading(true);
    try {
      await connectWallet(selectedRole);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleLock = async () => {
    if (!secret || !receiver || !amount) {
      setError('Please fill in all fields');
      return;
    }

    setError(null);
    setTxHash(null);
    setLoading(true);

    try {
      const hash = await lockFunds(secret, receiver, amount, parseInt(timeoutMinutes));
      setTxHash(hash);
      setSecret(''); // Clear secret for security
      await loadHTLCDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to lock funds');
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!claimHashLock) {
      setError('Please enter the hash lock');
      return;
    }
    if (!claimSecret) {
      setError('Please enter the secret');
      return;
    }

    setError(null);
    setTxHash(null);
    setLoading(true);

    try {
      const hash = await claimFunds(claimHashLock, claimSecret);
      setTxHash(hash);
      setClaimSecret(''); // Clear secret for security
      setClaimHashLock(''); // Clear hash lock
      await loadHTLCDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to claim funds');
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (addr: string) => {
    if (!addr || addr === '0x0') return 'Not set';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatAmount = (amt: bigint) => {
    if (!amt || amt === 0n) return '0';
    return amt.toString();
  };

  const formatTimeout = (timestamp: number) => {
    if (!timestamp) return 'Not set';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  if (!account) {
    const roleToConnect = panel === 'maker' ? 'alice' : 'bob';
    const roleLabel = panel === 'maker' ? 'Alice (Receiver)' : 'Bob (Sender)';

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Starknet HTLC - Connect Wallet</CardTitle>
          <CardDescription>
            {panel === 'maker'
              ? 'Connect as Alice to claim locked STRK'
              : 'Connect as Bob to lock STRK for Alice'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => handleConnect(roleToConnect)}
            disabled={loading}
            className="w-full"
          >
            {loading ? <Loader2 className="animate-spin" /> : `Connect as ${roleLabel}`}
          </Button>
          {error && (
            <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Wallet Status */}
      <Card>
        <CardHeader>
          <CardTitle>Connected as {role === 'bob' ? 'Bob (Sender)' : 'Alice (Receiver)'}</CardTitle>
          <CardDescription>
            <div className="space-y-1">
              <div>Address: {formatAddress(address || '')}</div>
              <div className="text-lg font-semibold text-green-600">
                Balance: {balance || '...'} STRK
              </div>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Funding buttons (devnet faucet) */}
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Coins className="h-4 w-4" />
              Request STRK (Devnet Faucet)
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleFundSTRK(500)}
                disabled={funding}
              >
                {funding ? <Loader2 className="h-4 w-4 animate-spin" /> : '+500 STRK'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleFundSTRK(1000)}
                disabled={funding}
              >
                {funding ? <Loader2 className="h-4 w-4 animate-spin" /> : '+1000 STRK'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleFundSTRK(5000)}
                disabled={funding}
              >
                {funding ? <Loader2 className="h-4 w-4 animate-spin" /> : '+5000 STRK'}
              </Button>
            </div>
            {fundingSuccess && (
              <div className="text-sm text-green-400 bg-green-950/20 border border-green-900 rounded-md p-2">
                {fundingSuccess}
              </div>
            )}
          </div>

          <Button onClick={disconnectWallet} variant="outline">
            Disconnect
          </Button>
        </CardContent>
      </Card>

      {/* HTLC Status */}
      <Card>
        <CardHeader>
          <CardTitle>HTLC Status</CardTitle>
          <CardDescription>Query HTLC details by hash lock</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              value={queryHashLock}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQueryHashLock(e.target.value)}
              placeholder="0x... (hash lock to query)"
              className="flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={loadHTLCDetails}
              disabled={loading || !queryHashLock}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          {htlcDetails ? (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="font-semibold">Sender:</span>
                <span>{formatAddress(htlcDetails.sender)}</span>

                <span className="font-semibold">Receiver:</span>
                <span>{formatAddress(htlcDetails.receiver)}</span>

                <span className="font-semibold">Amount:</span>
                <span className="text-green-600 font-bold">{formatAmount(htlcDetails.amount)} STRK</span>

                <span className="font-semibold">Timeout:</span>
                <span>{formatTimeout(htlcDetails.timeout)}</span>

                <span className="font-semibold">Claimed:</span>
                <span className={htlcDetails.claimed ? 'text-green-600' : 'text-gray-400'}>
                  {htlcDetails.claimed ? '✅ Yes' : '❌ No'}
                </span>

                <span className="font-semibold">Refunded:</span>
                <span className={htlcDetails.refunded ? 'text-red-600' : 'text-gray-400'}>
                  {htlcDetails.refunded ? '✅ Yes' : '❌ No'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Enter hash lock and click refresh to query HTLC</p>
          )}
        </CardContent>
      </Card>

      {/* Bob's Lock Interface */}
      {role === 'bob' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Lock STRK Funds
            </CardTitle>
            <CardDescription>
              Create a new HTLC to lock STRK for Alice to claim
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="secret" className="text-sm font-medium">Secret (remember this!)</label>
              <Input
                id="secret"
                type="text"
                value={secret}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSecret(e.target.value)}
                placeholder="Enter a secret phrase"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="receiver" className="text-sm font-medium">Receiver Address (Alice)</label>
              <Input
                id="receiver"
                type="text"
                value={receiver}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReceiver(e.target.value)}
                placeholder="0x..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="amount" className="text-sm font-medium">Amount (STRK)</label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
                  placeholder="1000"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="timeout" className="text-sm font-medium">Timeout (minutes)</label>
                <Input
                  id="timeout"
                  type="number"
                  value={timeoutMinutes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTimeoutMinutes(e.target.value)}
                  placeholder="60"
                />
              </div>
            </div>

            {/* Balance check warning */}
            {balance && parseFloat(amount) > parseFloat(balance) && (
              <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 flex items-center gap-2">
                <span>Insufficient balance! You have {balance} STRK but trying to lock {amount} STRK.</span>
              </div>
            )}

            <Button
              onClick={handleLock}
              disabled={loading || htlcDetails?.amount !== 0n || (balance ? parseFloat(amount) > parseFloat(balance) : false)}
              className="w-full"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Lock Funds'}
            </Button>

            {htlcDetails?.amount !== 0n && (
              <div className="text-sm text-yellow-400 bg-yellow-950/20 border border-yellow-900 rounded-md p-2">
                HTLC already has locked funds. Wait for claim or refund.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Alice's Claim Interface */}
      {role === 'alice' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5" />
              Claim STRK Funds
            </CardTitle>
            <CardDescription>
              Enter the hash lock and secret to claim locked STRK
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="claimHashLock" className="text-sm font-medium">Hash Lock</label>
              <Input
                id="claimHashLock"
                type="text"
                value={claimHashLock}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaimHashLock(e.target.value)}
                placeholder="0x... (HTLC hash lock)"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="claimSecret" className="text-sm font-medium">Secret</label>
              <Input
                id="claimSecret"
                type="text"
                value={claimSecret}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaimSecret(e.target.value)}
                placeholder="Enter the secret"
              />
            </div>

            <Button
              onClick={handleClaim}
              disabled={loading || !claimHashLock || !claimSecret}
              className="w-full"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Claim Funds'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Transaction Result */}
      {txHash && (
        <div className="text-sm text-green-400 bg-green-950/20 border border-green-900 rounded-md p-2 break-all">
          <strong>Transaction Hash:</strong> {txHash}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2">
          {error}
        </div>
      )}
    </div>
  );
};
