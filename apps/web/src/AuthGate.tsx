import { useEffect, useState, type FormEvent } from 'react';
import { authApi, type AuthSession } from './api';
import { App } from './App';

function FrameIcon() {
  return <svg viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="30" height="28" rx="2" /><path d="M3 12h30M12 4v8m12-8v8" /></svg>;
}

export function AuthGate() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authApi.me().then((value) => {
      if (active) setSession(value);
    }).catch((cause: unknown) => {
      if (active && cause instanceof Error && cause.message !== 'Please sign in to continue.') setError(cause.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    const expire = () => {
      setSession(null);
      setPassword('');
      setError('Your session ended. Sign in to continue.');
    };
    window.addEventListener('storyboard:session-expired', expire);
    return () => {
      active = false;
      window.removeEventListener('storyboard:session-expired', expire);
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const value = await authApi.login(username.trim(), password);
      setPassword('');
      setSession(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await authApi.logout();
      setSession(null);
      setPassword('');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="auth-loading" role="status">Opening your workspace…</div>;
  if (session) return <App username={session.username} onSignOut={signOut} signingOut={busy} signOutError={error} />;

  return (
    <main className="login-page">
      <div className="login-brand"><span className="login-brand-mark"><FrameIcon /></span>Storyboard<span className="brand-dot">.</span></div>
      <div className="login-layout">
        <section className="login-intro" aria-label="Welcome">
          <div className="login-rule" />
          <h1>Every story<br />starts with a frame.</h1>
          <p>Your scenes, shots, and visual ideas are ready when you are.</p>
          <div className="login-frame" aria-hidden="true"><span>01</span><div /><span>YOUR STORY, IN SEQUENCE</span></div>
        </section>
        <section className="login-form-area" aria-labelledby="login-heading">
          <h2 id="login-heading">Welcome back</h2>
          <p>Sign in to continue your storyboard.</p>
          <form onSubmit={signIn}>
            <div className="field"><label htmlFor="login-username">Username</label><input id="login-username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required disabled={busy} /></div>
            <div className="field"><label htmlFor="login-password">Password</label><input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={busy} /></div>
            {error && <div className="notice error" role="alert">{error}</div>}
            <button className="primary-button login-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
          </form>
        </section>
      </div>
    </main>
  );
}
