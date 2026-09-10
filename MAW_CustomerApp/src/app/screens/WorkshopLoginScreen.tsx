import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Camera, Lock, User } from 'lucide-react';
import { BrandLogoBadge } from '../components/BrandLogoBadge';
import { hasWorkshopSession, loginWorkshop } from '../lib/workshop-api';

export function WorkshopLoginScreen() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (hasWorkshopSession()) return <Navigate to="/workshop/jobs" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await loginWorkshop(username.trim(), password, rememberMe);
      navigate('/workshop/jobs', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-[#eef3fb] p-5">
      <div className="mb-6 flex justify-center"><BrandLogoBadge plain /></div>
      <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-xl shadow-blue-950/10">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Camera /></span>
          <div><h1 className="text-xl font-bold text-slate-900">Workshop Portal</h1><p className="text-sm text-slate-500">Foreman and workshop team sign-in</p></div>
        </div>
        {error ? <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <label className="mb-4 block text-sm font-semibold text-slate-700">Email or username
          <span className="mt-1 flex items-center rounded-xl border border-slate-200 px-3"><User className="h-4 w-4 text-slate-400" /><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required className="w-full bg-transparent px-3 py-3 outline-none" /></span>
        </label>
        <label className="mb-4 block text-sm font-semibold text-slate-700">Password
          <span className="mt-1 flex items-center rounded-xl border border-slate-200 px-3"><Lock className="h-4 w-4 text-slate-400" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="w-full bg-transparent px-3 py-3 outline-none" /></span>
        </label>
        <label className="mb-5 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /> Keep me signed in</label>
        <button disabled={submitting} className="h-12 w-full rounded-xl bg-blue-700 font-bold text-white disabled:opacity-50">{submitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
