import React, { useState } from 'react';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(mode === 'register' ? { name } : {}) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Authentication failed.');
      onAuthenticated();
    } catch (err: any) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xl">A</div>
          <h1 className="text-2xl font-semibold tracking-tight">AppPulse Intelligence</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in to access your research workspace.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20">
          <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-950 p-1 text-sm">
            <button type="button" onClick={() => { setMode('login'); setError(''); }} className={`rounded-md py-2 transition ${mode === 'login' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Sign in</button>
            <button type="button" onClick={() => { setMode('register'); setError(''); }} className={`rounded-md py-2 transition ${mode === 'register' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Create account</button>
          </div>
          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <label className="block text-sm text-slate-300">
                Full name
                <input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-indigo-500" autoComplete="name" />
              </label>
            )}
            <label className="block text-sm text-slate-300">
              Email address
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-indigo-500" autoComplete="email" />
            </label>
            <label className="block text-sm text-slate-300">
              Password
              <input required type="password" minLength={mode === 'register' ? 12 : 1} maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-indigo-500" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
              {mode === 'register' && <span className="mt-1 block text-xs text-slate-500">Use at least 12 characters.</span>}
            </label>
            {error && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in to workspace' : 'Create secure workspace'}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-xs text-slate-500">Your session is protected by an HttpOnly, same-site cookie.</p>
      </section>
    </main>
  );
};
