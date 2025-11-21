import { useStore } from './lib/store';
import { LoginPanel } from './components/LoginPanel';
import { NodeStatus } from './components/NodeStatus';
import { CreateOrderForm } from './components/CreateOrderForm';
import { ProposalsList } from './components/ProposalsList';
import { MyOrders } from './components/MyOrders';
import { OrdersList } from './components/OrdersList';
import { CreateProposalForm } from './components/CreateProposalForm';
import { Lock, Shield } from 'lucide-react';
import { useState } from 'react';
import type { Order } from './lib/types';

function App() {
  const aliceUser = useStore((state) => state.alice.user);
  const bobUser = useStore((state) => state.bob.user);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

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
                <div className="text-sm">
                  <div className="text-muted-foreground">Connected as</div>
                  <div className="font-medium">{aliceUser.username}</div>
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
                <div className="text-sm">
                  <div className="text-muted-foreground">Connected as</div>
                  <div className="font-medium">{bobUser.username}</div>
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
                    onClose={() => setSelectedOrder(null)}
                    onSuccess={() => setSelectedOrder(null)}
                  />
                ) : (
                  <OrdersList onSelectOrder={setSelectedOrder} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Settlement Status Panel */}
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-sm font-medium">Settlement Pipeline</span>
            </div>
            <span className="text-xs text-muted-foreground">
              NATS Connected • Rust Service Ready
            </span>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-4">
            <div className="border border-primary/50 rounded-md p-3 bg-primary/10">
              <div className="text-xs text-muted-foreground mb-1">Privacy Layer</div>
              <div className="font-semibold text-sm">Zcash</div>
              <div className="text-xs text-green-400 mt-1">● Active</div>
            </div>

            <div className="border border-primary/50 rounded-md p-3 bg-primary/10">
              <div className="text-xs text-muted-foreground mb-1">Stablecoin</div>
              <div className="font-semibold text-sm">zTarknet</div>
              <div className="text-xs text-green-400 mt-1">● Active</div>
            </div>

            <div className="border border-border rounded-md p-3 bg-muted/20 opacity-50">
              <div className="text-xs text-muted-foreground mb-1">Stablecoin</div>
              <div className="font-semibold text-sm">Solana</div>
              <div className="text-xs text-muted-foreground mt-1">Coming Soon</div>
            </div>

            <div className="border border-border rounded-md p-3 bg-muted/20 opacity-50">
              <div className="text-xs text-muted-foreground mb-1">Intents</div>
              <div className="font-semibold text-sm">NEAR</div>
              <div className="text-xs text-muted-foreground mt-1">Coming Soon</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
