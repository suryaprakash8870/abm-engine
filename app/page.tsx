import Link from 'next/link';
import { GlowBackground } from '@/lib/web/shell';

export default function Home() {
  return (
    <div className="relative min-h-screen text-white">
      <GlowBackground />
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
        <h1 className="font-display text-4xl font-medium tracking-tight">ABM Engine</h1>
        <p className="mt-3 text-white/55">
          11 independent engines connected by an event bus. See{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">docs/project/architecture.md</code> and{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">docs/project/ownership.md</code>.
        </p>
        <div className="mt-7 flex items-center gap-3">
          <Link href="/signup" className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-400">
            Get started →
          </Link>
          <Link href="/login" className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">
            Log in
          </Link>
        </div>
      </main>
    </div>
  );
}
