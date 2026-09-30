import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

export function AuthPage() {
  const { user, loading, profileLoading, isStoreOwner, gateMessage, clearGateMessage } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && !profileLoading && user && isStoreOwner) {
    return <Navigate to="/" replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    clearGateMessage();
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  const blocked = gateMessage;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.png" alt="Zoda WRS" />
          <h2>Zoda WRS Admin</h2>
          <p className="hint" style={{ marginBottom: 0 }}>
            Water refilling station back-office
          </p>
        </div>
        <h1>Store admin sign in</h1>
        <p className="hint">
          Same Supabase account as the Seller and Customer apps. Only the <strong>master admin (owner)</strong> can use
          this dashboard.
        </p>
        {blocked ? <p className="error-text">{blocked}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        <form onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-water" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create owner account'}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 16, marginBottom: 0 }}>
          {mode === 'signin' ? (
            <>
              First store?{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('signup')}>
                Register as owner
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
