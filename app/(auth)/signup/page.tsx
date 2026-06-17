'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, PrimaryButton, Banner, inputClass } from '../../icp/ui';
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
      <h1 className="font-display text-xl font-semibold">Create your workspace</h1>
      {error && <Banner tone="red">{error}</Banner>}
      <form onSubmit={submit} className="space-y-3">
        <input type="text" placeholder="Your name (optional)" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <input type="password" required minLength={8} placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        <PrimaryButton type="submit" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</PrimaryButton>
      </form>
      <p className="text-sm text-white/50">
        Already have an account? <Link href="/login" className="text-blue-300 underline hover:text-blue-200">Log in</Link>
      </p>
    </Card>
  );
}
