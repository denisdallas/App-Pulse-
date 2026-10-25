import { useState } from 'react';

type AuthMode = 'login' | 'register';

export function AuthView({ onAuthenticated, serviceError }: { onAuthenticated: () => void; serviceError: string | null }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('My Workspace');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, workspaceName }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Authentication failed');
      onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <section className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">AppPulse Intelligence</p>
        <h1 className="mb-2 text-2xl font-semibold">{mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace'}</h1>
        <p className="mb-6 text-sm text-slate-400">Your research data is private to your authenticated workspace.</p>
        {serviceError && <p role="alert" aria-live="assertive" className="mb-4 rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">{serviceError}</p>}
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm text-slate-300">Email<input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="block text-sm text-slate-300">Password<input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" type="password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /><span className="mt-1 block text-xs text-slate-500">At least 12 characters.</span></label>
          {mode === 'register' && <label className="block text-sm text-slate-300">Workspace name<input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" required value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></label>}
          {error && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
          <button className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50" disabled={submitting} type="submit">{submitting ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="mt-5 text-sm text-cyan-400 hover:text-cyan-300" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>{mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}</button>
      </section>
    </main>
  );
}
