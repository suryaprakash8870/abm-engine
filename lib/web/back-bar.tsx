'use client';

import { usePathname, useRouter } from 'next/navigation';

/**
 * Global "Back" control shown at the top of every page's content (via AppShell).
 * Uses browser history so it returns to wherever the user came from; falls back
 * to the dashboard when there's no history (e.g. a direct page load / refresh).
 * Hidden on the dashboard itself, which is the home of the app.
 */
export function BackBar({ crumb }: { crumb?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === '/today') return null;

  const onBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/today');
  };

  return (
    <div className="mb-5 flex items-center gap-3">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[13px] text-white/70 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        Back
      </button>
      {crumb && <span className="text-[11px] font-medium uppercase tracking-wider text-white/25">{crumb}</span>}
    </div>
  );
}
