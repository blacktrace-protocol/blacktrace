import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { aliceAPI, bobAPI } from '../lib/api';
import { useStore } from '../lib/store';
import type { NodeSide } from '../lib/types';
import { CheckCircle, Wallet } from 'lucide-react';

interface LoginPanelProps {
  side: NodeSide;
  title: string;
}

export function LoginPanel({ side, title }: LoginPanelProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [zcashAddress, setZcashAddress] = useState('');

  const setUser = useStore((state) => state.setUser);
  const setPeerID = useStore((state) => state.setPeerID);

  const api = side === 'alice' ? aliceAPI : bobAPI;

  const handleRegister = async () => {
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    setLoading(true);
    setError('');
    setRegistrationSuccess(false);

    try {
      const response = await api.register(username, password);
      setRegistrationSuccess(true);
      setZcashAddress(response.zcash_address || '');

      // Show success message for a moment, then auto-login
      setTimeout(async () => {
        try {
          const user = await api.login(username, password);
          setUser(side, user);

          const status = await api.getStatus();
          setPeerID(side, status.peer_id || status.peerID);
        } catch (loginErr: any) {
          setError('Registration successful, but auto-login failed. Please sign in manually.');
        }
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
      setRegistrationSuccess(false);
    } finally {
      setLoading(false);
    }
  };

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

      const status = await api.getStatus();
      setPeerID(side, status.peer_id || status.peerID);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Create an account or sign in to start trading
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Username</label>
              <Input
                placeholder="Enter username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
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
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </TabsContent>

          <TabsContent value="register" className="space-y-4 mt-4">
            {!registrationSuccess ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Username</label>
                  <Input
                    placeholder="Choose a username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError('');
                    }}
                    onKeyPress={(e) => e.key === 'Enter' && handleRegister()}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    placeholder="Choose a password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    onKeyPress={(e) => e.key === 'Enter' && handleRegister()}
                  />
                </div>
                {error && (
                  <div className="text-sm text-destructive">{error}</div>
                )}
                <Button
                  onClick={handleRegister}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </Button>
                <div className="text-xs text-muted-foreground text-center">
                  A Zcash wallet will be created automatically for you
                </div>
              </>
            ) : (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Account created successfully!</span>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wallet className="h-4 w-4" />
                    <span>Your Zcash Wallet</span>
                  </div>
                  <div className="font-mono text-xs break-all bg-background/50 rounded p-2">
                    {zcashAddress}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Save this address - you'll be able to request testnet ZEC after signing in
                  </div>
                </div>

                <div className="text-sm text-center text-muted-foreground">
                  Automatically signing you in...
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
