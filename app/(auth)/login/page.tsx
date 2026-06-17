'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, PrimaryButton, Banner } from '../../icp/ui';
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
      <h1 className="text-xl font-semibold">Log in to ABM Engine</h1>
      {error && <Banner tone="red">{error}</Banner>}
      <form onSubmit={submit} className="space-y-3">
        <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <PrimaryButton type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</PrimaryButton>
      </form>
      <p className="text-sm text-gray-500">
        No account? <Link href="/signup" className="underline hover:text-gray-700">Sign up</Link>
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
