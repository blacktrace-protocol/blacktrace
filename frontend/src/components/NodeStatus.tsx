import { useEffect, useState } from 'react';
import { Activity, Server } from 'lucide-react';
import type { NodeSide } from '../lib/types';
import { aliceAPI, bobAPI } from '../lib/api';

interface NodeStatusProps {
  side: NodeSide;
}

interface StatusInfo {
  peer_id: string;
  listen_addr: string;
  peer_count: number;
  order_count: number;
}

export function NodeStatus({ side }: NodeStatusProps) {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  const api = side === 'alice' ? aliceAPI : bobAPI;
  const nodeName = side === 'alice' ? 'Alice' : 'Bob';

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await api.getStatus();
        setStatus(data);
        setIsOnline(true);
        setLoading(false);
      } catch (err) {
        setIsOnline(false);
        setStatus(null);
        setLoading(false);
      }
    };

    // Fetch immediately
    fetchStatus();

    // Poll every 3 seconds
    const interval = setInterval(fetchStatus, 3000);

    return () => clearInterval(interval);
  }, [api]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Activity className="h-4 w-4 animate-pulse" />
        <span>Checking node status...</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${
            isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          }`}
        ></div>
        <Server className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {nodeName} Node {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {isOnline && status && (
        <div className="space-y-1 text-xs text-muted-foreground pl-6">
          <div className="flex justify-between">
            <span>Peer ID:</span>
            <span className="font-mono text-foreground truncate max-w-[150px]" title={status.peer_id}>
              {status.peer_id.slice(0, 12)}...
            </span>
          </div>
          <div className="flex justify-between">
            <span>Connected Peers:</span>
            <span className="font-medium text-foreground">{status.peer_count}</span>
          </div>
          <div className="flex justify-between">
            <span>Active Orders:</span>
            <span className="font-medium text-foreground">{status.order_count}</span>
          </div>
        </div>
      )}

      {!isOnline && (
        <div className="text-xs text-red-400 pl-6">
          Node is not responding. Please check if the backend is running.
        </div>
      )}
    </div>
  );
}
