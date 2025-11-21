import { useStore } from './lib/store';
import { LoginPanel } from './components/LoginPanel';
import { NodeStatus } from './components/NodeStatus';
import { CreateOrderForm } from './components/CreateOrderForm';
import { ProposalsList } from './components/ProposalsList';
import { MyOrders } from './components/MyOrders';
import { OrdersList } from './components/OrdersList';
import { CreateProposalForm } from './components/CreateProposalForm';
import { MyProposals } from './components/MyProposals';
import { SettlementQueue } from './components/SettlementQueue';
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
              <div className="space-y-4">
                <CreateOrderForm />
                <MyOrders />
                <ProposalsList />
              </div>
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
            ) : (
              <div className="space-y-4">
                {selectedOrder ? (
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
                  <OrdersList onSelectOrder={setSelectedOrder} />
                )}
                <MyProposals onEditProposal={(order, proposal) => {
                  // When editing a rejected proposal, set both order and proposal
                  // This will open CreateProposalForm with pre-filled values
                  setSelectedOrder(order);
                  setEditingProposal(proposal);
                }} />
              </div>
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
