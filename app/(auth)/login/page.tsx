'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/web/auth-api';
import { AuthMarketing, GoogleAuthButton, AuthDivider } from '../ui';

const OAUTH_ERRORS: Record<string, string> = {
  google_unconfigured: 'Google sign-in isn’t set up yet. Use email, or add Google OAuth keys.',
  google_state: 'Google sign-in expired or was interrupted. Please try again.',
  google_unverified: 'Your Google email isn’t verified.',
  google_failed: 'Google sign-in failed. Please try again.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/today';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(OAUTH_ERRORS[params.get('error') ?? ''] ?? null);
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
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      <AuthMarketing />

      {/* Form panel */}
      <main className="relative flex min-h-screen items-center justify-center bg-canvas px-6 py-10 sm:px-10">
        {/* Subtle ambient on small screens (when marketing is hidden) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden">
          <div
            className="animate-breathe-soft absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(197,251,80,0.30), rgba(133,221,53,0.08) 42%, transparent 70%)',
              filter: 'blur(68px)',
            }}
          />
        </div>

        <div className="animate-rise relative z-10 w-full max-w-[420px] space-y-8">
          {/* Mobile-only brand */}
          <Link href="/" className="inline-flex items-center gap-2.5 lg:hidden">
            <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_14px_3px_rgba(197,251,80,0.6)]" />
            <span className="font-display text-sm font-semibold uppercase tracking-wide text-white/85">
              ABM Engine
            </span>
          </Link>

          <header className="space-y-2">
            <h2 className="font-display text-[32px] font-medium leading-tight tracking-tight text-white">
              Welcome back.
            </h2>
            <p className="text-sm text-white/50">
              Log in to your workspace to keep the engines running.
            </p>
          </header>

          {error && (
            <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <GoogleAuthButton next={next} label="Log in with Google" />
          <AuthDivider />

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-white/45">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white placeholder-white/30 outline-none transition focus:border-accent/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(197,251,80,0.12)]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-white/45">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white placeholder-white/30 outline-none transition focus:border-accent/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(197,251,80,0.12)]"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="group relative mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground shadow-[0_0_0_1px_rgba(197,251,80,0.3),0_18px_36px_-18px_rgba(197,251,80,0.7)] transition hover:bg-accent-hover hover:shadow-[0_0_0_1px_rgba(197,251,80,0.45),0_22px_44px_-16px_rgba(197,251,80,0.85)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
            >
              {busy ? 'Logging in…' : 'Log in'}
              {!busy && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition group-hover:translate-x-0.5"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </form>

          <p className="text-sm text-white/55">
            New here?{' '}
            <Link href="/signup" className="font-medium text-accent transition hover:text-accent-hover">
              Create a workspace →
            </Link>
          </p>

          <footer className="border-t border-white/5 pt-6 text-[11px] text-white/30">
            By logging in you agree to keep your engines warm. <span aria-hidden>·</span> ABM Engine v0.11
          </footer>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
