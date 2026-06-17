'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, PrimaryButton, Banner, inputClass } from '../../icp/ui';
import { login } from '@/lib/web/auth-api';

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/icp';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await login(email, password);
    if (r.ok) {
      router.push(next);
      router.refresh();
    } else {
      setError(r.error?.message ?? 'Login failed.');
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      <h1 className="font-display text-xl font-semibold">Log in to ABM Engine</h1>
      {error && <Banner tone="red">{error}</Banner>}
      <form onSubmit={submit} className="space-y-3">
        <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        <PrimaryButton type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</PrimaryButton>
      </form>
      <p className="text-sm text-white/50">
        No account? <Link href="/signup" className="text-blue-300 underline hover:text-blue-200">Sign up</Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
