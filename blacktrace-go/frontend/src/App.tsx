import { useStore } from './lib/store';
import { LoginPanel } from './components/LoginPanel';
import { NodeStatus } from './components/NodeStatus';
import { Lock, Shield } from 'lucide-react';

function App() {
  const aliceUser = useStore((state) => state.alice.user);
  const bobUser = useStore((state) => state.bob.user);

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
                {/* Alice's trading interface will go here */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <p className="text-center text-muted-foreground">
                    Alice's trading interface coming soon...
                  </p>
                </div>
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
                {/* Bob's trading interface will go here */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <p className="text-center text-muted-foreground">
                    Bob's trading interface coming soon...
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Settlement Status Panel */}
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="text-sm font-medium">Settlement Pipeline</span>
            <span className="ml-auto text-xs text-muted-foreground">
              NATS Connected • Rust Service Ready
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
