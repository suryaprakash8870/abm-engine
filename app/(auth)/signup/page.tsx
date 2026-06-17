'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, PrimaryButton, Banner } from '../../icp/ui';
import { signup } from '@/lib/web/auth-api';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await signup(email, password, fullName || undefined);
    if (r.ok) {
      router.push('/icp');
      router.refresh();
    } else {
      setError(r.error?.message ?? 'Sign up failed.');
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4">
      <h1 className="text-xl font-semibold">Create your workspace</h1>
      {error && <Banner tone="red">{error}</Banner>}
      <form onSubmit={submit} className="space-y-3">
        <input type="text" placeholder="Your name (optional)" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input type="password" required minLength={8} placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <PrimaryButton type="submit" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</PrimaryButton>
      </form>
      <p className="text-sm text-gray-500">
        Already have an account? <Link href="/login" className="underline hover:text-gray-700">Log in</Link>
      </p>
    </Card>
  );
}
