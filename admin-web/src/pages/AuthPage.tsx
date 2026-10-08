import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { PasswordInput } from '../components/PasswordInput';
import {
  parseAuthCredentials,
  sanitizeAuthEmail,
  sanitizeAuthPassword,
  sanitizeAuthPasswordSignup,
} from '../lib/authInputSecurity';
import { supabase } from '../lib/supabase';

function WaterDropIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.5c-3.2 4.8-6 8.4-6 12a6 6 0 1 0 12 0c0-3.6-2.8-7.2-6-12z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M12 8.5c1.2 1.8 2.2 3.2 2.2 4.8a2.2 2.2 0 1 1-4.4 0c0-1.6 1-3 2.2-4.8z"
        fill="rgba(255,255,255,0.35)"
      />
    </svg>
  );
}

function WaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 24" fill="none" aria-hidden>
      <path
        d="M0 14c8-8 16-8 24 0s16 8 24 0 16-8 16 0v10H0V14z"
        fill="currentColor"
        opacity="0.25"
      />
      <path
        d="M0 18c6-5 12-5 18 0s12 5 18 0 12-5 12 0v6H0v-6z"
        fill="currentColor"
        opacity="0.45"
      />
    </svg>
  );
}

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
      const creds = parseAuthCredentials(email, password, {
        mode: mode === 'signin' ? 'login' : 'signup',
        strictCommandFilter: mode === 'signup',
      });
      if (!creds.ok) {
        setError(creds.error);
        return;
      }
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({ email: creds.email, password: creds.password });
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
      <aside className="auth-hero" aria-label="Zoda WRS branding">
        <div className="auth-hero-glow" aria-hidden />
        <WaterDropIcon className="auth-deco auth-deco--drop-1" />
        <WaterDropIcon className="auth-deco auth-deco--drop-2" />
        <WaterDropIcon className="auth-deco auth-deco--drop-3" />
        <span className="auth-deco auth-deco--bubble auth-deco--b1" aria-hidden />
        <span className="auth-deco auth-deco--bubble auth-deco--b2" aria-hidden />
        <span className="auth-deco auth-deco--bubble auth-deco--b3" aria-hidden />

        <div className="auth-hero-content">
          <div className="auth-hero-logo-wrap">
            <img src="/logo.png" alt="Zoda WRS" className="auth-hero-logo" />
          </div>
          <h1 className="auth-hero-title">Zoda WRS Admin</h1>
          <p className="auth-hero-tagline">Water refilling station back-office</p>

          <ul className="auth-hero-features">
            <li>
              <span className="auth-hero-feature-icon" aria-hidden>
                💧
              </span>
              Inventory &amp; POS
            </li>
            <li>
              <span className="auth-hero-feature-icon" aria-hidden>
                📦
              </span>
              Orders &amp; delivery
            </li>
            <li>
              <span className="auth-hero-feature-icon" aria-hidden>
                👥
              </span>
              Staff &amp; customers
            </li>
          </ul>

          <WaveIcon className="auth-hero-wave" />
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <h2 className="auth-panel-title">{mode === 'signin' ? 'Store admin sign in' : 'Register store owner'}</h2>
          <p className="hint auth-panel-hint">
            Same Supabase account as the Seller and Customer apps. Only the <strong>master admin (owner)</strong> can
            use this dashboard.
          </p>
          {blocked ? <p className="error-text">{blocked}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          <form onSubmit={(e) => void submit(e)}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(sanitizeAuthEmail(e.target.value))}
                required
                maxLength={254}
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signin' ? 'Enter your password' : 'Create a password (min. 6 characters)'}
                value={password}
                onChange={(e) =>
                  setPassword(
                    mode === 'signup'
                      ? sanitizeAuthPasswordSignup(e.target.value, true)
                      : sanitizeAuthPassword(e.target.value)
                  )
                }
                required
                minLength={6}
                maxLength={128}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-water auth-submit-btn" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create owner account'}
            </button>
          </form>
          <p className="hint auth-panel-footer">
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
      </main>
    </div>
  );
}
