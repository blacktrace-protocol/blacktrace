import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useMakerStarknet, useTakerStarknet, type HTLCDetails } from '../lib/starknet';
import { Loader2, Lock, Unlock, RefreshCw } from 'lucide-react';

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

  useEffect(() => {
    if (account) {
      loadHTLCDetails();
      const interval = setInterval(loadHTLCDetails, 5000);
      return () => clearInterval(interval);
    }
  }, [account]);

  const loadHTLCDetails = async () => {
    try {
      const details = await getHTLCDetails();
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
    if (!claimSecret) {
      setError('Please enter the secret');
      return;
    }

    setError(null);
    setTxHash(null);
    setLoading(true);

    try {
      const hash = await claimFunds(claimSecret);
      setTxHash(hash);
      setClaimSecret(''); // Clear secret for security
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
        <CardContent>
          <Button onClick={disconnectWallet} variant="outline">
            Disconnect
          </Button>
        </CardContent>
      </Card>

      {/* HTLC Status */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>HTLC Status</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={loadHTLCDetails}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
            <p className="text-muted-foreground">No HTLC active</p>
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

            <Button
              onClick={handleLock}
              disabled={loading || htlcDetails?.amount !== 0n}
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
              Enter the secret to claim locked STRK
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="claimSecret" className="text-sm font-medium">Secret</label>
              <Input
                id="claimSecret"
                type="text"
                value={claimSecret}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClaimSecret(e.target.value)}
                placeholder="Enter the secret from Bob"
              />
            </div>

            <Button
              onClick={handleClaim}
              disabled={loading || htlcDetails?.amount === 0n || htlcDetails?.claimed}
              className="w-full"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Claim Funds'}
            </Button>

            {htlcDetails?.amount === 0n && (
              <div className="text-sm text-gray-400 bg-gray-950/20 border border-gray-900 rounded-md p-2">
                No funds locked in HTLC
              </div>
            )}

            {htlcDetails?.claimed && (
              <div className="text-sm text-green-400 bg-green-950/20 border border-green-900 rounded-md p-2">
                ✅ Funds already claimed!
              </div>
            )}
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
