'use client';

/**
 * Left sidebar navigation — the SaaS shell. Replaces the old top header.
 * Groups the 11 engines + cross-cutting pages, highlights the active route,
 * shows a "Get started" checklist derived from live pipeline status, and folds
 * Guide / Settings / logout into the footer. Collapses to a drawer on mobile.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { me, logout } from './auth-api';

interface NavItem { label: string; href: string; icon: IconName }
interface NavGroup { group: string; items: NavItem[] }

// Business-workflow nav (ADR-015): the 11 engines run behind the scenes; users
// navigate by business function. Scoring/Awareness are configured from their
// parent pages + Settings; the engine "system map" lives in the footer.
const NAV: NavGroup[] = [
  { group: 'Overview', items: [
    { label: 'Dashboard', href: '/today', icon: 'home' },
    { label: 'Data Sources', href: '/integrations', icon: 'plug' },
  ] },
  { group: 'Build', items: [
    { label: 'ICP', href: '/icp', icon: 'target' },
    { label: 'Target Accounts', href: '/tal', icon: 'list' },
  ] },
  { group: 'Engage', items: [
    { label: 'Contacts', href: '/contacts', icon: 'users' },
    { label: 'Signals', href: '/signals', icon: 'signal' },
    { label: 'Campaigns', href: '/plays', icon: 'play' },
  ] },
  { group: 'Measure', items: [
    { label: 'Analytics', href: '/insights', icon: 'chart' },
  ] },
];

// 5-step get-started, each tied to a pipeline engine being active.
const STEPS: { label: string; num: string; href: string }[] = [
  { label: 'Connect a data source', num: '10', href: '/integrations' },
  { label: 'Define your ICP', num: '01', href: '/icp' },
  { label: 'Build target accounts', num: '02', href: '/tal' },
  { label: 'Map contacts', num: '06', href: '/contacts' },
  { label: 'Launch a campaign', num: '09', href: '/plays' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [activeNums, setActiveNums] = useState<Set<string>>(new Set());
  // Collapsed by default; remember the user's choice so it doesn't pop open every load.
  const [stepsOpen, setStepsOpen] = useState(false);
  useEffect(() => {
    try { setStepsOpen(localStorage.getItem('abm_getstarted_open') === '1'); } catch { /* ignore */ }
  }, []);
  const toggleSteps = () => setStepsOpen((v) => {
    const next = !v;
    try { localStorage.setItem('abm_getstarted_open', next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });

  useEffect(() => {
    void me().then((r) => { if (r.ok && r.data) setEmail(r.data.email); });
    void fetch('/api/v1/pipeline/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        const engines = b?.data?.engines as { num: string; active: boolean }[] | undefined;
        if (engines) setActiveNums(new Set(engines.filter((e) => e.active).map((e) => e.num)));
      })
      .catch(() => {});
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setOpen(false); }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const doneCount = STEPS.filter((s) => activeNums.has(s.num)).length;

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.07] bg-canvas/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link href="/today" className="flex items-center gap-2 font-display text-[15px] font-medium text-white">
          <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_2px_rgba(197,251,80,0.6)]" />
          ABM Engine
        </Link>
        <button onClick={() => setOpen((v) => !v)} aria-label="Menu" className="rounded-lg border border-white/12 bg-white/[0.04] p-2 text-white/70">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>

      {/* Backdrop (mobile, when open) */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-white/[0.07] bg-canvas/80 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <Link href="/today" className="flex items-center gap-2.5 px-5 py-5 font-display text-[15px] font-medium tracking-tight text-white">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_14px_3px_rgba(197,251,80,0.6)]" />
          ABM Engine
        </Link>

        {/* Nav */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">{g.group}</p>
              <div className="space-y-0.5">
                {g.items.map((it) => {
                  const active = isActive(it.href);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition ${
                        active
                          ? 'bg-accent/[0.12] font-medium text-accent'
                          : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
                      }`}
                    >
                      <span className={active ? 'text-accent' : 'text-white/40'}><Icon name={it.icon} /></span>
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Get started — hidden once setup is complete (all steps done). */}
        {doneCount < STEPS.length && (
        <div className="mx-3 mb-3 shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
          <button onClick={toggleSteps} className="flex w-full items-center gap-2.5">
            <Ring done={doneCount} total={STEPS.length} />
            <div className="flex-1 text-left">
              <p className="text-[12px] font-medium text-white/85">Get started</p>
              <p className="text-[10.5px] text-white/40">{doneCount} of {STEPS.length} done</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-white/40 transition ${stepsOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {stepsOpen && (
            <div className="mt-2.5 space-y-0.5 border-t border-white/[0.06] pt-2.5">
              {STEPS.map((s) => {
                const done = activeNums.has(s.num);
                return (
                  <Link key={s.num} href={s.href} className="flex items-center gap-2 rounded-md px-1 py-1 text-[12px] transition hover:bg-white/[0.05]">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${done ? 'border-accent bg-accent text-accent-foreground' : 'border-white/20 text-transparent'}`}>✓</span>
                    <span className={done ? 'text-white/45 line-through' : 'text-white/70'}>{s.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* Footer */}
        <div className="space-y-0.5 border-t border-white/[0.07] px-3 py-3">
          <Link href="/pipeline" className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${isActive('/pipeline') ? 'text-accent' : 'text-white/55 hover:bg-white/[0.05] hover:text-white'}`}>
            <span className="text-white/40"><Icon name="flow" /></span> System map
          </Link>
          <Link href="/guide" className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${isActive('/guide') ? 'text-accent' : 'text-white/55 hover:bg-white/[0.05] hover:text-white'}`}>
            <span className="text-white/40"><Icon name="book" /></span> Guide
          </Link>
          <Link href="/settings" className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${isActive('/settings') ? 'text-accent' : 'text-white/55 hover:bg-white/[0.05] hover:text-white'}`}>
            <span className="text-white/40"><Icon name="settings" /></span> Settings
          </Link>
          <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
            <span className="truncate text-[11px] text-white/40" title={email ?? ''}>{email ?? '—'}</span>
            <button
              onClick={async () => { await logout(); router.push('/login'); router.refresh(); }}
              className="shrink-0 text-[11px] text-white/40 underline transition hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Ring({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" className="shrink-0">
      <circle cx="15" cy="15" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
      <circle
        cx="15" cy="15" r={r} fill="none" stroke="#C5FB50" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 15 15)"
      />
      <text x="15" y="16" textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#fff" fontFamily="ui-monospace,monospace">{done}</text>
    </svg>
  );
}

type IconName = 'home' | 'flow' | 'target' | 'list' | 'gauge' | 'users' | 'signal' | 'funnel' | 'play' | 'chart' | 'plug' | 'settings' | 'book';

function Icon({ name }: { name: IconName }) {
  const p: Record<IconName, React.ReactNode> = {
    home: <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    flow: <><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="12" r="2" /><path d="M7 6h6a4 4 0 0 1 4 4M7 18h6a4 4 0 0 0 4-4" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    gauge: <><path d="M12 13a3 3 0 1 0 3-3" /><path d="M3.5 12a8.5 8.5 0 0 1 17 0" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8M21 20a6 6 0 0 0-4-5.7" /></>,
    signal: <path d="M4 20v-4M9 20v-8M14 20v-12M19 20V6" />,
    funnel: <path d="M3 5h18l-7 8v6l-4-2v-4z" />,
    play: <path d="M7 4l13 8-13 8z" />,
    chart: <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-7" />,
    plug: <path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></>,
    book: <path d="M5 4a1 1 0 0 1 1-1h13v16H6a1 1 0 0 0-1 1zM19 19H6" />,
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {p[name]}
    </svg>
  );
}
