/**
 * Shared app chrome for the dark "Gemini" theme. Used by every section layout
 * so the whole app shares one canvas, one glow, and one header.
 *
 * - GlowBackground: fixed, behind everything — a breathing blue radial glow on a
 *   near-black canvas. Pure markup (no hooks) so it's safe in server components.
 * - AppHeader: sticky glass header with the brand crumb + UserMenu.
 * - AppShell: GlowBackground + AppHeader + a centered <main>.
 */

import Link from 'next/link';
import { UserMenu } from './user-menu';

/** Fixed, full-viewport dark canvas with a top-anchored breathing blue glow. */
export function GlowBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0b0d14]">
      {/* Wrapper centers the blob; the inner div animates scale/opacity only. */}
      <div className="absolute left-1/2 top-[-200px] -translate-x-1/2">
        <div
          className="animate-breathe-soft h-[640px] w-[640px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(66,108,255,0.5), rgba(82,120,255,0.14) 42%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>
    </div>
  );
}

/** Sticky glass header. `crumb` renders after the brand as "ICP Engine / <crumb>". */
export function AppHeader({ crumb }: { crumb?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0d14]/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/icp" className="font-display text-base font-medium tracking-tight text-white">
          ICP Engine{crumb ? <span className="text-white/35"> / {crumb}</span> : null}
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}

/** Full page shell: glow + header + centered main. */
export function AppShell({ crumb, children }: { crumb?: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen text-white">
      <GlowBackground />
      <AppHeader crumb={crumb} />
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
    </div>
  );
}
