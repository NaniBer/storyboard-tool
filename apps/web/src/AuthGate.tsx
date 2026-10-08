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
  const [temporaryLogin, setTemporaryLogin] = useState<{ username: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const authChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('storyboard-auth');
    if (authChannel) authChannel.onmessage = (event: MessageEvent) => {
      if (event.data !== 'signed-out') return;
      authApi.forgetSession();
      setSession(null);
      setPassword('');
      setError(null);
    };
    Promise.allSettled([authApi.me(), authApi.options()]).then(([identity, options]) => {
      if (!active) return;
      if (identity.status === 'fulfilled') setSession(identity.value);
      else if (identity.reason instanceof Error && identity.reason.message !== 'Please sign in to continue.') setError(identity.reason.message);
      if (options.status === 'fulfilled') setTemporaryLogin(options.value.temporaryLogin);
      setLoading(false);
    });
    const expire = () => {
      setSession(null);
      setPassword('');
      setError('Your session ended. Sign in to continue.');
    };
    window.addEventListener('storyboard:session-expired', expire);
    return () => {
      active = false;
      authChannel?.close();
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

  function fillTemporaryLogin() {
    if (!temporaryLogin || busy) return;
    setError(null);
    setUsername(temporaryLogin.username);
    setPassword(temporaryLogin.password);
  }

  async function signOut() {
    setBusy(true);
    try {
      await authApi.logout();
      if (typeof BroadcastChannel !== 'undefined') {
        const authChannel = new BroadcastChannel('storyboard-auth');
        authChannel.postMessage('signed-out');
        authChannel.close();
      }
      setSession(null);
      setPassword('');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className={"auth-loading grid min-h-[100vh] place-items-center text-[#514b45] text-[14px]"} role="status">Opening your workspace…</div>;
  if (session) return <App username={session.username} onSignOut={signOut} signingOut={busy} signOutError={error} />;

  return (
    <main className={"login-page min-h-[100vh] p-[30px_clamp(24px,_5vw,_80px)] bg-paper max-[760px]:p-[20px_24px_50px]"}>
      <div className={"login-brand flex items-center gap-[8px] w-[fit-content] text-ink [font-family:Georgia,_'Times_New_Roman',_serif] text-[22px] font-bold tracking-[-.02em]"}><span className={"login-brand-mark grid place-items-center w-[34px] h-[34px] mr-[4px] text-rust [&_svg]:w-[32px] [&_svg]:h-[32px]"}><FrameIcon /></span>Storyboard<span className={"brand-dot text-[#d99975]"}>.</span></div>
      <div className={"login-layout grid [grid-template-columns:minmax(0,_1.1fr)_minmax(350px,_.9fr)] items-center gap-[clamp(60px,_9vw,_160px)] max-w-[1240px] min-h-[calc(100vh_-_95px)] m-[0_auto] max-[760px]:[grid-template-columns:1fr] max-[760px]:gap-[38px] max-[760px]:min-h-[auto] max-[760px]:pt-[54px] max-[520px]:gap-[33px] max-[520px]:pt-[42px]"}>
        <section className={"login-intro p-[30px_0_60px] [&_h1]:max-w-[710px] [&_h1]:m-0 [&_h1]:text-ink [&_h1]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h1]:text-[clamp(48px,_5.5vw,_82px)] [&_h1]:font-normal [&_h1]:tracking-[-.035em] [&_h1]:leading-[1.08] [&_h1]:[text-wrap:balance] [&_p]:max-w-[420px] [&_p]:m-[27px_0_0] [&_p]:text-muted [&_p]:text-[16px] [&_p]:leading-[1.7] max-[760px]:p-0 max-[760px]:[&_h1]:text-[clamp(45px,_10vw,_66px)] max-[760px]:[&_p]:mt-[18px]"} aria-label="Welcome">
          <div className={"login-rule w-[56px] h-[2px] mb-[38px] bg-[#ad6949] max-[520px]:mb-[24px]"} />
          <h1>Every story<br />starts with a frame.</h1>
          <p>Your scenes, shots, and visual ideas are ready when you are.</p>
          <div className={"login-frame flex items-center gap-[18px] max-w-[520px] mt-[clamp(55px,_10vh,_110px)] text-[#9e6246] text-[10px] font-bold tracking-[.1em] [&_span:first-child]:grid [&_span:first-child]:place-items-center [&_span:first-child]:w-[46px] [&_span:first-child]:h-[35px] [&_span:first-child]:[border:1px_solid_#cbb8a6] [&_span:first-child]:rounded-[5px] [&_span:first-child]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_span:first-child]:text-[16px] [&_span:first-child]:tracking-[0] [&_div]:flex-1 [&_div]:h-[1px] [&_div]:bg-[#cbb8a6] max-[760px]:hidden"} aria-hidden="true"><span>01</span><div /><span>YOUR STORY, IN SEQUENCE</span></div>
        </section>
        <section className={"login-form-area w-full max-w-[440px] p-[46px_clamp(28px,_4vw,_54px)_52px] rounded-[12px] bg-[#fff] shadow-[0_18px_42px_-26px_rgba(48,_35,_24,_.34)] [&_h2]:m-0 [&_h2]:text-ink [&_h2]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h2]:text-[36px] [&_h2]:font-normal [&_h2]:tracking-[-.025em] [&_>_p]:m-[11px_0_38px] [&_>_p]:text-muted [&_>_p]:text-[14px] [&_>_p]:leading-[1.5] [&_.field_+_.field]:mt-[25px] max-[760px]:max-w-[none] max-[520px]:p-[32px_25px_38px] max-[520px]:[&_h2]:text-[32px]"} aria-labelledby="login-heading">
          <h2 id="login-heading">Welcome back</h2>
          <p>Sign in to continue your storyboard.</p>
          {temporaryLogin && <div className="mb-[28px]">
            <button className="flex w-full min-h-[48px] items-center justify-between rounded-[6px] border border-[#293c32] bg-transparent px-[17px] text-[13px] font-bold text-ink transition-colors duration-[180ms] hover:bg-[#ecf0eb] focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#a65a3e] disabled:opacity-50" type="button" onClick={fillTemporaryLogin} disabled={busy}>
              Fill temporary login
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
            </button>
            <p className="mt-[10px] text-[12px] leading-[1.5] text-muted">Fills the test credentials below. Press Sign in to enter the shared workspace.</p>
          </div>}
          {error && <div className={"notice mb-[23px] p-[12px_14px] rounded-[6px] text-[12px] leading-[1.5] [&.error]:text-[#7d2e24] [&.error]:bg-[#f9eae7] error"} role="alert">{error}</div>}
          <form onSubmit={signIn}>
            <div className={"field [&_+_.field]:mt-[30px] [&_label]:block [&_label]:mb-[11px] [&_label]:text-[#39342f] [&_label]:text-[13px] [&_label]:font-bold [&_input]:block [&_input]:w-full [&_input]:p-[14px_15px] [&_input]:[border:1px_solid_#d4cec6] [&_input]:rounded-[6px] [&_input]:[outline:none] [&_input]:text-[#2b2926] [&_input]:bg-[#fff] [&_input]:text-[14px] [&_input]:leading-[1.5] [&_input]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_textarea]:block [&_textarea]:w-full [&_textarea]:p-[14px_15px] [&_textarea]:[border:1px_solid_#d4cec6] [&_textarea]:rounded-[6px] [&_textarea]:[outline:none] [&_textarea]:text-[#2b2926] [&_textarea]:bg-[#fff] [&_textarea]:text-[14px] [&_textarea]:leading-[1.5] [&_textarea]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_input::placeholder]:text-[#78736c] [&_textarea::placeholder]:text-[#78736c] [&_input:hover]:[border-color:#9f968d] [&_textarea:hover]:[border-color:#9f968d] [&_input:focus]:[border-color:#a65a3e] [&_input:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_textarea:focus]:[border-color:#a65a3e] [&_textarea:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_input:disabled]:opacity-[.68] [&_textarea:disabled]:opacity-[.68] [&_textarea]:min-h-[145px] [&_textarea]:[resize:vertical]"}><label htmlFor="login-username">Username</label><input id="login-username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required disabled={busy} /></div>
            <div className={"field [&_+_.field]:mt-[30px] [&_label]:block [&_label]:mb-[11px] [&_label]:text-[#39342f] [&_label]:text-[13px] [&_label]:font-bold [&_input]:block [&_input]:w-full [&_input]:p-[14px_15px] [&_input]:[border:1px_solid_#d4cec6] [&_input]:rounded-[6px] [&_input]:[outline:none] [&_input]:text-[#2b2926] [&_input]:bg-[#fff] [&_input]:text-[14px] [&_input]:leading-[1.5] [&_input]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_textarea]:block [&_textarea]:w-full [&_textarea]:p-[14px_15px] [&_textarea]:[border:1px_solid_#d4cec6] [&_textarea]:rounded-[6px] [&_textarea]:[outline:none] [&_textarea]:text-[#2b2926] [&_textarea]:bg-[#fff] [&_textarea]:text-[14px] [&_textarea]:leading-[1.5] [&_textarea]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_input::placeholder]:text-[#78736c] [&_textarea::placeholder]:text-[#78736c] [&_input:hover]:[border-color:#9f968d] [&_textarea:hover]:[border-color:#9f968d] [&_input:focus]:[border-color:#a65a3e] [&_input:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_textarea:focus]:[border-color:#a65a3e] [&_textarea:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_input:disabled]:opacity-[.68] [&_textarea:disabled]:opacity-[.68] [&_textarea]:min-h-[145px] [&_textarea]:[resize:vertical]"}><label htmlFor="login-password">Password</label><input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={busy} /></div>
            <button className={"primary-button inline-flex items-center justify-center gap-[13px] min-h-[43px] p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-[#fff] bg-ink text-[12px] font-bold whitespace-nowrap transition-[background,transform] duration-[180ms] [&:hover:not(:disabled)]:bg-[#3f5849] [&:hover:not(:disabled)]:[transform:translateY(-1px)] [&:disabled]:opacity-[.5] [&_svg]:w-[17px] [&_svg]:h-[17px] max-[520px]:[align-self:flex-start] login-submit w-full mt-[32px] min-h-[48px] justify-between [padding-inline:17px] text-[13px] [&_svg]:w-[17px] [&_svg]:h-[17px]"} type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
          </form>
        </section>
      </div>
    </main>
  );
}
