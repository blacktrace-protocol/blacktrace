import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { bobAPI } from '../lib/api';
import { Lock, RefreshCw, CheckCircle, AlertCircle, Unlock, Clock, Zap, Coins, AlertTriangle } from 'lucide-react';
import type { Proposal, Order } from '../lib/types';
import { useTakerStarknet } from '../lib/starknet';
import { useStore } from '../lib/store';
import { Account, RpcProvider, CallData } from 'starknet';
import { logWorkflowStart, logSettlement, logStateChange, logSuccess, logError } from '../lib/logger';

// Devnet faucet for STRK funding (using 4th pre-deployed account)
const FAUCET_ACCOUNT = {
  address: '0x4f348398f859a55a0c80b1446c5fdc37edb3a8478a32f10764659fc241027d3',
  privateKey: '0xa641611c17d4d92bd0790074e34beeb7',
};
const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const DEVNET_RPC_URL = 'http://127.0.0.1:5050/rpc';

// Alice's Starknet address (receiver for Bob's HTLC lock)
const ALICE_STARKNET_ADDRESS = '0x078662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1';

interface BobSettlementProps {
  onCountChange?: (count: number) => void;
}

export function BobSettlement({ onCountChange }: BobSettlementProps = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [proposalsByOrder, setProposalsByOrder] = useState<Record<string, Proposal[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockingProposal, setLockingProposal] = useState<string | null>(null);
  const [claimingProposal, setClaimingProposal] = useState<string | null>(null);
  const [claimSecret, setClaimSecret] = useState<Record<string, string>>({});
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [fundingSuccess, setFundingSuccess] = useState<string | null>(null);

  // Starknet wallet context for STRK balance and locking
  const { account: starknetAccount, address: starknetAddress, balance: strkBalance, connectWallet: connectStarknet, role } = useTakerStarknet();

  // Get Bob's user token from store and ensure bobAPI has it
  const bobUser = useStore((state) => state.bob.user);

  // Set token on bobAPI when user is available
  useEffect(() => {
    if (bobUser?.token) {
      bobAPI.setToken(bobUser.token);
    }
  }, [bobUser?.token]);

  const fetchSettlementProposals = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch all orders and sort by timestamp (latest first)
      const ordersData = await bobAPI.getOrders();
      const sortedOrders = ordersData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setOrders(sortedOrders);

      // Fetch proposals for each order that need settlement action from Bob
      const proposalsMap: Record<string, Proposal[]> = {};
      for (const order of sortedOrders) {
        try {
          const response = await bobAPI.getProposalsForOrder(order.id);
          if (response.proposals && response.proposals.length > 0) {
            // Filter proposals where Alice has locked ZEC or both are locked (waiting for claim)
            // strk_claimed = Alice claimed her STRK, Bob can now claim ZEC
            const settlementProposals = response.proposals
              .filter(p =>
                p.id &&
                p.id.trim() !== '' &&
                p.status === 'accepted' &&
                (p.settlement_status === 'alice_locked' || p.settlement_status === 'both_locked' || p.settlement_status === 'alice_claimed' || p.settlement_status === 'strk_claimed')
              )
              .sort((a, b) => {
                const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timeB - timeA;
              });

            if (settlementProposals.length > 0) {
              proposalsMap[order.id] = settlementProposals;
            }
          }
        } catch (err) {
          console.error(`Failed to fetch proposals for ${order.id}:`, err);
        }
      }
      setProposalsByOrder(proposalsMap);

      // Count total proposals
      const totalCount = Object.values(proposalsMap).reduce((acc, proposals) => acc + proposals.length, 0);
      onCountChange?.(totalCount);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch settlement proposals');
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlementProposals();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchSettlementProposals, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-connect Starknet wallet if not connected
  useEffect(() => {
    if (!starknetAccount) {
      connectStarknet('bob').catch(console.error);
    }
  }, []);

  // Fund STRK from devnet faucet
  const handleFundSTRK = async (amount: number) => {
    if (!starknetAddress) {
      setError('Please wait for Starknet wallet to connect');
      return;
    }

    setFunding(true);
    setError('');
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
          recipient: starknetAddress,
          amount: { low: amountLow, high: amountHigh },
        }),
      });

      await provider.waitForTransaction(tx.transaction_hash);

      setFundingSuccess(`Successfully funded ${amount} STRK!`);

      // Refresh balance by reconnecting
      setTimeout(async () => {
        if (role) {
          await connectStarknet(role);
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

  const handleLockSTRK = async (proposal: Proposal, amount: number, price: number) => {
    const totalSTRK = amount * price;

    logWorkflowStart('SETTLEMENT', 'Bob Locking STRK');
    logSettlement('Preparing STRK lock on Starknet', 'alice_locked', {
      balance: `${strkBalance} STRK`,
      required: `${totalSTRK.toFixed(2)} STRK`,
      hashLock: proposal.hash_lock?.substring(0, 12) + '...'
    });

    // Check STRK balance before locking
    if (strkBalance && parseFloat(strkBalance) < totalSTRK) {
      setError(`Insufficient STRK balance! You have ${strkBalance} STRK but need ${totalSTRK.toFixed(2)} STRK. Please fund your wallet first.`);
      return;
    }

    // Check if hash_lock is available from proposal
    if (!proposal.hash_lock) {
      setError('Hash lock not available yet. The settlement service may still be processing. Please wait and try again.');
      return;
    }

    try {
      setLockingProposal(proposal.id);
      setError('');

      logSettlement('Locking STRK (demo mode)', 'alice_locked', {
        amount: `${totalSTRK.toFixed(2)} STRK`,
        proposalId: proposal.id.substring(0, 8) + '...'
      });

      // DEMO SIMULATION: The HTLC contract uses Pedersen hash but Zcash uses RIPEMD160(SHA256)
      // We simulate the lock by transferring STRK to Alice directly (same as simulated claim)
      // This demonstrates the UX flow while we upgrade to Cairo 2.7+ for SHA256 support

      const provider = new RpcProvider({ nodeUrl: DEVNET_RPC_URL });

      // Use Bob's account to transfer STRK to Alice (simulating HTLC lock)
      // In production, this would go to the HTLC contract
      const bobAccount = new Account(
        provider,
        starknetAddress!,
        '0x0000000000000000000000000000000071d7bb07b9a64f6f78ac4c816aff4da9' // Bob's private key
      );

      const amountWei = BigInt(Math.floor(totalSTRK * 1e18));
      const amountLow = amountWei & ((1n << 128n) - 1n);
      const amountHigh = amountWei >> 128n;

      const tx = await bobAccount.execute({
        contractAddress: STRK_TOKEN_ADDRESS,
        entrypoint: 'transfer',
        calldata: CallData.compile({
          recipient: ALICE_STARKNET_ADDRESS,
          amount: { low: amountLow, high: amountHigh },
        }),
      });
      await provider.waitForTransaction(tx.transaction_hash);

      // Refresh Bob's balance
      if (starknetAddress && role) {
        await connectStarknet(role);
      }

      logStateChange('SETTLEMENT', 'alice_locked', 'both_locked', proposal.id.substring(0, 8) + '...');
      logSuccess('SETTLEMENT', 'STRK locked - Waiting for Alice to claim', { txHash: tx.transaction_hash.substring(0, 12) + '...' });

      // Call backend API to update settlement status
      await bobAPI.lockUSDC(proposal.id);

      // Refresh proposals to see updated status
      fetchSettlementProposals();
    } catch (err: any) {
      logError('SETTLEMENT', 'Failed to lock STRK', err);
      setError(err.response?.data?.error || err.message || 'Failed to lock STRK on Starknet');
    } finally {
      setLockingProposal(null);
    }
  };

  const handleClaimZEC = async (proposalId: string) => {
    const secret = claimSecret[proposalId];
    if (!secret) {
      setError('Please enter the secret to claim ZEC');
      return;
    }

    // Ensure token is set before API call
    if (!bobUser?.token) {
      setError('Not logged in. Please log in as Bob first.');
      return;
    }
    bobAPI.setToken(bobUser.token);

    try {
      setClaimingProposal(proposalId);
      setError('');
      setClaimSuccess(null);

      logWorkflowStart('SETTLEMENT', 'Bob Claiming ZEC');
      logSettlement('Claiming ZEC from Zcash HTLC', 'strk_claimed', {
        proposalId: proposalId.substring(0, 8) + '...'
      });

      // Call backend API to claim ZEC using the revealed secret
      // The secret was revealed on-chain when Alice claimed STRK
      await bobAPI.claimZEC(proposalId, secret);

      logStateChange('SETTLEMENT', 'strk_claimed', 'complete', proposalId.substring(0, 8) + '...');
      logSuccess('SETTLEMENT', 'ZEC claimed! Atomic swap complete');
      setClaimSuccess(`ZEC claimed successfully! Transaction submitted.`);

      // Clear the secret input
      setClaimSecret(prev => ({ ...prev, [proposalId]: '' }));

      // Refresh proposals
      fetchSettlementProposals();

      // Clear success message after 5 seconds
      setTimeout(() => setClaimSuccess(null), 5000);
    } catch (err: any) {
      logError('SETTLEMENT', 'Failed to claim ZEC', err);
      setError(err.response?.data?.error || err.message || 'Failed to claim ZEC. Make sure the secret is correct.');
    } finally {
      setClaimingProposal(null);
    }
  };

  // Count total proposals
  const totalProposals = Object.values(proposalsByOrder).reduce((acc, proposals) => acc + proposals.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Settlement - Lock Assets
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Auto-refreshing every 5 seconds • {totalProposals} proposal{totalProposals !== 1 ? 's' : ''} awaiting your action
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/20 border border-red-900 rounded-md p-2 mb-4 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STRK Wallet Balance and Funding */}
        <div className="mb-4 p-3 bg-purple-950/20 border border-purple-900 rounded-md">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-purple-400 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              STRK Wallet Balance
            </div>
            <div className="text-lg font-bold text-purple-400">
              {strkBalance || '...'} STRK
            </div>
          </div>

          {/* Funding buttons */}
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFundSTRK(500)}
              disabled={funding}
              className="flex-1"
            >
              {funding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Coins className="h-3 w-3 mr-1" />+500</>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFundSTRK(1000)}
              disabled={funding}
              className="flex-1"
            >
              {funding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Coins className="h-3 w-3 mr-1" />+1000</>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFundSTRK(2000)}
              disabled={funding}
              className="flex-1"
            >
              {funding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Coins className="h-3 w-3 mr-1" />+2000</>}
            </Button>
          </div>
          {fundingSuccess && (
            <div className="text-xs text-green-400 mt-2">✅ {fundingSuccess}</div>
          )}
          <div className="text-xs text-muted-foreground mt-2">
            Fund STRK from devnet faucet for testing
          </div>
        </div>

        {totalProposals === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <Lock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <div>No proposals awaiting settlement</div>
            <div className="text-xs mt-1">Proposals will appear here after the maker locks ZEC</div>
          </div>
        )}

        <div className="space-y-6">
          {orders.map((order) => {
            const proposals = proposalsByOrder[order.id] || [];
            if (proposals.length === 0) return null;

            return (
              <div key={order.id} className="space-y-3">
                <div className="border-b border-border pb-2">
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    For Order
                  </div>
                  <div className="font-mono text-xs break-all text-primary">
                    {order.id}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {proposals.length} proposal{proposals.length !== 1 ? 's' : ''} for this order
                  </div>
                </div>

                {proposals.map((proposal, idx) => {
                  const totalAmount = proposal.amount / 100 * proposal.price;
                  const assetSymbol = order.stablecoin || 'USDC';
                  const isSTRK = assetSymbol === 'STRK';
                  const isAliceLocked = proposal.settlement_status === 'alice_locked';
                  const isBothLocked = proposal.settlement_status === 'both_locked';
                  const isAliceClaimed = proposal.settlement_status === 'alice_claimed' || proposal.settlement_status === 'strk_claimed';

                  return (
                    <div
                      key={proposal.id || `proposal-${idx}`}
                      className={`border rounded-lg p-4 ${
                        isAliceClaimed
                          ? 'border-amber-900/50 bg-amber-950/10'
                          : isBothLocked
                            ? 'border-blue-900/50 bg-blue-950/10'
                            : 'border-green-900/50 bg-green-950/10'
                      }`}
                    >
                      <div className="mb-3 pb-2 border-b border-border">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-muted-foreground">Proposal ID</div>
                          <div className="text-xs text-muted-foreground">
                            {proposal.timestamp ? new Date(proposal.timestamp).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                        <div className="font-mono text-xs break-all text-primary">
                          {proposal.id || 'N/A'}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <div className="text-xs text-muted-foreground">ZEC Amount</div>
                          <div className="text-lg font-semibold">
                            {(proposal.amount / 100).toFixed(2)} ZEC
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Price</div>
                          <div className="text-lg font-semibold">
                            {isSTRK ? '' : '$'}{proposal.price}{isSTRK ? ' STRK' : ''}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">{assetSymbol} {isAliceLocked ? 'to Lock' : 'Locked'}</div>
                          <div className="text-lg font-semibold text-green-400">
                            {isSTRK ? '' : '$'}{totalAmount.toFixed(2)}{isSTRK ? ' STRK' : ''}
                          </div>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="text-xs text-muted-foreground mb-1">Settlement Status</div>
                        <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                          isAliceClaimed
                            ? 'bg-amber-950/20 text-amber-400 border border-amber-900'
                            : isBothLocked
                              ? 'bg-blue-950/20 text-blue-400 border border-blue-900'
                              : 'bg-green-950/20 text-green-400 border border-green-900'
                        }`}>
                          {isAliceClaimed ? (
                            <>
                              <Unlock className="h-3 w-3" />
                              Alice Claimed STRK - Claim Your ZEC!
                            </>
                          ) : isBothLocked ? (
                            <>
                              <Clock className="h-3 w-3" />
                              Both Locked - Waiting for Alice to Claim
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-3 w-3" />
                              Alice Locked ZEC - Your Turn
                            </>
                          )}
                        </div>
                      </div>

                      {/* Alice Locked - Bob needs to lock */}
                      {isAliceLocked && (
                        <>
                          <div className="mb-3 p-3 bg-green-950/20 border border-green-900 rounded text-sm">
                            <div className="flex items-center gap-2 mb-2 text-green-400">
                              <AlertCircle className="h-4 w-4" />
                              <span className="font-medium">Alice has locked {(proposal.amount / 100).toFixed(2)} ZEC</span>
                            </div>
                            <div className="text-xs text-green-400/80">
                              You can now safely lock your {assetSymbol}. The atomic swap ensures you'll receive the ZEC once both sides are locked.
                            </div>
                          </div>

                          {/* Hash lock availability indicator */}
                          {!proposal.hash_lock && (
                            <div className="mb-3 p-2 bg-yellow-950/20 border border-yellow-900 rounded text-xs text-yellow-400 flex items-start gap-2">
                              <Clock className="h-4 w-4 mt-0.5 flex-shrink-0 animate-pulse" />
                              <span>
                                Waiting for HTLC hash from settlement service... This will be available shortly.
                              </span>
                            </div>
                          )}

                          {/* Show hash_lock when available */}
                          {proposal.hash_lock && (
                            <div className="mb-3 p-2 bg-blue-950/20 border border-blue-900 rounded text-xs">
                              <div className="text-blue-400 mb-1">HTLC Hash Lock:</div>
                              <div className="font-mono text-blue-300 break-all">{proposal.hash_lock}</div>
                            </div>
                          )}

                          {/* Balance check warning */}
                          {isSTRK && strkBalance && parseFloat(strkBalance) < totalAmount && (
                            <div className="mb-3 p-2 bg-red-950/20 border border-red-900 rounded text-xs text-red-400 flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <span>
                                Insufficient balance! You have {strkBalance} STRK but need {totalAmount.toFixed(2)} STRK.
                                Use the funding buttons above to add more STRK.
                              </span>
                            </div>
                          )}

                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => handleLockSTRK(proposal, proposal.amount / 100, proposal.price)}
                            disabled={lockingProposal === proposal.id || (isSTRK && !!strkBalance && parseFloat(strkBalance) < totalAmount) || !proposal.hash_lock}
                          >
                            {lockingProposal === proposal.id ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                Locking STRK...
                              </>
                            ) : (
                              <>
                                <Lock className="h-4 w-4 mr-1" />
                                Lock {isSTRK ? `${totalAmount.toFixed(2)} STRK` : `$${totalAmount.toFixed(2)} ${assetSymbol}`}
                              </>
                            )}
                          </Button>
                          <div className="text-xs text-muted-foreground mt-2 text-center">
                            This will lock your STRK in the Starknet HTLC contract
                          </div>
                        </>
                      )}

                      {/* Both Locked - Waiting for Alice to claim */}
                      {isBothLocked && (
                        <div className="p-3 bg-blue-950/20 border border-blue-900 rounded text-sm text-blue-400">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4" />
                            <span className="font-medium">Both Parties Locked</span>
                          </div>
                          <div className="text-xs text-blue-400/80">
                            Waiting for Alice to claim STRK. When she does, the secret will be revealed on-chain and you can claim ZEC.
                          </div>
                        </div>
                      )}

                      {/* Alice Claimed - Bob can claim ZEC */}
                      {isAliceClaimed && (
                        <>
                          <div className="mb-3 p-2 bg-amber-950/20 border border-amber-900 rounded text-xs text-amber-400">
                            <div className="flex items-center gap-2 mb-1">
                              <Zap className="h-4 w-4" />
                              <span className="font-medium">Alice Claimed STRK - Secret Revealed!</span>
                            </div>
                            Alice has claimed her STRK and revealed the secret. Enter the secret below to claim your ZEC.
                          </div>

                          {claimSuccess && (
                            <div className="mb-3 p-2 bg-green-950/30 border border-green-800 rounded text-xs text-green-300">
                              ✅ {claimSuccess}
                            </div>
                          )}

                          <div className="space-y-3">
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">HTLC Secret (from on-chain)</label>
                              <Input
                                type="text"
                                placeholder="Enter the secret revealed by Alice's claim"
                                value={claimSecret[proposal.id] || ''}
                                onChange={(e) => setClaimSecret(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                                disabled={claimingProposal === proposal.id}
                              />
                            </div>

                            <Button
                              size="sm"
                              className="w-full bg-amber-600 hover:bg-amber-700"
                              onClick={() => handleClaimZEC(proposal.id)}
                              disabled={claimingProposal === proposal.id || !claimSecret[proposal.id]}
                            >
                              {claimingProposal === proposal.id ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                  Claiming ZEC...
                                </>
                              ) : (
                                <>
                                  <Unlock className="h-4 w-4 mr-1" />
                                  Claim {(proposal.amount / 100).toFixed(2)} ZEC
                                </>
                              )}
                            </Button>

                            <div className="text-xs text-muted-foreground text-center">
                              This will use the revealed secret to claim ZEC from the Zcash HTLC
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
