import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { aliceAPI, bobAPI } from '../lib/api';
import { useStore } from '../lib/store';
import type { NodeSide } from '../lib/types';

interface LoginPanelProps {
  side: NodeSide;
  title: string;
}

export function LoginPanel({ side, title }: LoginPanelProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setUser = useStore((state) => state.setUser);
  const setPeerID = useStore((state) => state.setPeerID);

  const api = side === 'alice' ? aliceAPI : bobAPI;

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await api.login(username, password);
      setUser(side, user);

      // Get peer ID from status
      const status = await api.getStatus();
      setPeerID(side, status.peer_id || status.peerID);
    } catch (err: any) {
      const loginError = err.response?.data?.error || '';

      // Only try to register if user doesn't exist
      if (loginError.includes('not found') || loginError.includes('does not exist')) {
        try {
          const user = await api.register(username, password);
          setUser(side, user);

          const status = await api.getStatus();
          setPeerID(side, status.peer_id || status.peerID);
        } catch (registerErr: any) {
          setError(registerErr.response?.data?.error || 'Registration failed');
        }
      } else {
        // Login failed for other reason (wrong password, etc)
        setError(loginError || 'Invalid username or password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Login or register to start trading
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Username</label>
          <Input
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Password</label>
          <Input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>
        {error && (
          <div className="text-sm text-destructive">{error}</div>
        )}
        <Button
          onClick={handleLogin}
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Loading...' : 'Login / Register'}
        </Button>
      </CardContent>
    </Card>
  );
}
