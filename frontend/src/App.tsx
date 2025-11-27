import { useStore } from './lib/store';
import { LoginPanel } from './components/LoginPanel';
import { NodeStatus } from './components/NodeStatus';
import { CreateOrderForm } from './components/CreateOrderForm';
import { ProposalsList } from './components/ProposalsList';
import { MyOrders } from './components/MyOrders';
import { OrdersList } from './components/OrdersList';
import { CreateProposalForm } from './components/CreateProposalForm';
import { MyProposals } from './components/MyProposals';
import { AliceSettlement } from './components/AliceSettlement';
import { BobSettlement } from './components/BobSettlement';
import { SettlementQueue } from './components/SettlementQueue';
import { WalletBalance } from './components/WalletBalance';
// StarknetHTLC tab removed - STRK functionality integrated into Settlement tab
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Lock, Shield, LogOut } from 'lucide-react';
import { useState } from 'react';
import type { Order, Proposal } from './lib/types';
import { Button } from './components/ui/button';

function App() {
  const aliceUser = useStore((state) => state.alice.user);
  const bobUser = useStore((state) => state.bob.user);
  const logout = useStore((state) => state.logout);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);

  // Track counts for tab badges
  const [aliceOrdersCount, setAliceOrdersCount] = useState(0);
  const [aliceProposalsCount, setAliceProposalsCount] = useState(0);
  const [aliceSettlementCount, setAliceSettlementCount] = useState(0);
  const [bobOrdersCount, setBobOrdersCount] = useState(0);
  const [bobProposalsCount, setBobProposalsCount] = useState(0);
  const [bobSettlementCount, setBobSettlementCount] = useState(0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">BlackTrace</h1>
                <p className="text-sm text-muted-foreground">
                  Trustless OTC for crypto-native institutions
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span>Encrypted P2P Trading</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Split Screen */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-2 gap-6">
          {/* Alice Panel */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Alice (Maker)</h2>
                <p className="text-sm text-muted-foreground">DAO Treasury Manager</p>
              </div>
              {aliceUser && (
                <div className="flex items-center gap-3">
                  <div className="text-sm text-right">
                    <div className="text-muted-foreground">Connected as</div>
                    <div className="font-medium">{aliceUser.username}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => logout('alice')}
                    className="h-8"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Node Status */}
            <NodeStatus side="alice" />

            {!aliceUser ? (
              <LoginPanel side="alice" title="Alice Login" />
            ) : (
              <Tabs defaultValue="wallet" className="w-full">
                <TabsList className="w-full grid grid-cols-5">
                  <TabsTrigger value="wallet">Wallet</TabsTrigger>
                  <TabsTrigger value="create-order">Create Order</TabsTrigger>
                  <TabsTrigger value="my-orders">
                    My Orders {aliceOrdersCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-primary text-primary-foreground rounded">{aliceOrdersCount}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="incoming-proposals">
                    Proposals {aliceProposalsCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-primary text-primary-foreground rounded">{aliceProposalsCount}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="settlement">
                    Settlement {aliceSettlementCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-primary text-primary-foreground rounded">{aliceSettlementCount}</span>}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="wallet">
                  <WalletBalance user="alice" />
                </TabsContent>
                <TabsContent value="create-order">
                  <CreateOrderForm />
                </TabsContent>
                <TabsContent value="my-orders">
                  <MyOrders onCountChange={setAliceOrdersCount} />
                </TabsContent>
                <TabsContent value="incoming-proposals">
                  <ProposalsList onCountChange={setAliceProposalsCount} />
                </TabsContent>
                <TabsContent value="settlement">
                  <AliceSettlement onCountChange={setAliceSettlementCount} />
                </TabsContent>
              </Tabs>
            )}
          </div>

          {/* Bob Panel */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Bob (Taker)</h2>
                <p className="text-sm text-muted-foreground">Privacy Whale</p>
              </div>
              {bobUser && (
                <div className="flex items-center gap-3">
                  <div className="text-sm text-right">
                    <div className="text-muted-foreground">Connected as</div>
                    <div className="font-medium">{bobUser.username}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => logout('bob')}
                    className="h-8"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Node Status */}
            <NodeStatus side="bob" />

            {!bobUser ? (
              <LoginPanel side="bob" title="Bob Login" />
            ) : selectedOrder ? (
              <CreateProposalForm
                order={selectedOrder}
                initialProposal={editingProposal || undefined}
                onClose={() => {
                  setSelectedOrder(null);
                  setEditingProposal(null);
                }}
                onSuccess={() => {
                  setSelectedOrder(null);
                  setEditingProposal(null);
                }}
              />
            ) : (
              <Tabs defaultValue="wallet" className="w-full">
                <TabsList className="w-full grid grid-cols-4">
                  <TabsTrigger value="wallet">Wallet</TabsTrigger>
                  <TabsTrigger value="available-orders">
                    Orders {bobOrdersCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-primary text-primary-foreground rounded">{bobOrdersCount}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="my-proposals">
                    Proposals {bobProposalsCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-primary text-primary-foreground rounded">{bobProposalsCount}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="settlement">
                    Settlement {bobSettlementCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-primary text-primary-foreground rounded">{bobSettlementCount}</span>}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="wallet">
                  <WalletBalance user="bob" />
                </TabsContent>
                <TabsContent value="available-orders">
                  <OrdersList onSelectOrder={setSelectedOrder} onCountChange={setBobOrdersCount} />
                </TabsContent>
                <TabsContent value="my-proposals">
                  <MyProposals
                    onEditProposal={(order, proposal) => {
                      setSelectedOrder(order);
                      setEditingProposal(proposal);
                    }}
                    onCountChange={setBobProposalsCount}
                  />
                </TabsContent>
                <TabsContent value="settlement">
                  <BobSettlement onCountChange={setBobSettlementCount} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>

        {/* Settlement Queue Panel */}
        <div className="mt-6">
          <SettlementQueue />
        </div>
      </div>
    </div>
  );
}

export default App;
