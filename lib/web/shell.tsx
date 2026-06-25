/**
 * Shared app chrome (dark canvas + lime accent). Used by every section layout
 * so the whole app shares one canvas, one glow, and one navigation shell.
 *
 * - GlowBackground: fixed, behind everything — corner glows on a near-black
 *   canvas. Pure markup (no hooks) so it's safe in server components.
 * - AppShell: GlowBackground + left Sidebar + a centered <main> + tour overlay.
 */

import { Sidebar } from './sidebar';
import { TourBanner } from '../tour/TourBanner';

/**
 * Fixed, full-viewport dark canvas with multiple breathing lime glows + grain.
 * The orbs are spread across the viewport so the canvas feels alive at every
 * scroll position, not just near the top of the page.
 */
export function GlowBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      {/* Top-left lime halo — the brand glow. */}
      <div className="absolute top-[-180px] left-[-140px]">
        <div
          className="animate-breathe-soft h-[560px] w-[560px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(197,251,80,0.60), rgba(133,221,53,0.14) 42%, transparent 70%)',
            filter: 'blur(70px)',
          }}
        />
      </div>

      {/* Bottom-right cool counter-glow — keeps the corner from going flat. */}
      <div
        className="absolute bottom-[-200px] right-[-160px]"
        style={{ animation: 'breathe-soft 18s ease-in-out infinite 4s' }}
      >
        <div
          className="h-[520px] w-[520px] rounded-full opacity-70"
          style={{
            background:
              'radial-gradient(circle, rgba(56,189,248,0.22), transparent 65%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      {/* Grain overlay for depth */}
      <div className="bg-grain absolute inset-0 opacity-[0.18]" />
    </div>
  );
}

/**
 * Full page shell: glow + left sidebar + centered main + tour overlay.
 * `crumb` is accepted for back-compat (every section layout passes it) but is no
 * longer rendered as a header — the sidebar's active state shows location now.
 */
export function AppShell({ crumb, children }: { crumb?: string; children: React.ReactNode }) {
  void crumb;
  return (
    <div className="relative min-h-screen text-white">
      <GlowBackground />
      <div className="lg:flex">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <main className="mx-auto max-w-4xl px-6 py-8 lg:py-10">{children}</main>
        </div>
      </div>
      <TourBanner />
    </div>
  );
}
