'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/icp', label: 'ICP Lab' },
];

export function TopNav() {
  const pathname = usePathname();

  // An account detail page is "inside" accounts — highlight the parent
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight text-neutral-900 dark:text-neutral-100"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-neutral-900 text-xs font-bold text-white dark:bg-white dark:text-neutral-900">
            A
          </span>
          ABM Engine
        </Link>

        {/* Divider */}
        <span className="h-5 w-px bg-neutral-200 dark:bg-neutral-800" />

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right-side status pill */}
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Phase 1
          </span>
        </div>
      </div>

      {/* Breadcrumb strip — rendered client-side per page using pathname */}
      <Breadcrumb pathname={pathname} />
    </nav>
  );
}

/** Minimal breadcrumb that parses the current pathname. */
function Breadcrumb({ pathname }: { pathname: string }) {
  const crumbs = buildCrumbs(pathname);
  if (crumbs.length <= 1) return null; // root — no breadcrumb needed

  return (
    <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-6 py-1.5">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-neutral-400">/</span>}
          {i < crumbs.length - 1 ? (
            <Link
              href={c.href}
              className="text-xs text-neutral-500 hover:text-neutral-800 hover:underline dark:hover:text-neutral-200"
            >
              {c.label}
            </Link>
          ) : (
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              {c.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

type Crumb = { href: string; label: string };

function buildCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return [{ href: '/', label: 'Dashboard' }];

  const crumbs: Crumb[] = [{ href: '/', label: 'Dashboard' }];
  let accumulated = '';

  for (const part of parts) {
    accumulated += '/' + part;
    if (part === 'accounts') {
      crumbs.push({ href: '/accounts', label: 'Accounts' });
    } else if (part === 'icp') {
      crumbs.push({ href: '/icp', label: 'ICP Lab' });
    } else {
      // Dynamic segment (account ID) — show a short label
      crumbs.push({ href: accumulated, label: shortId(part) });
    }
  }

  return crumbs;
}

/** Truncate a UUID-ish segment to something breadcrumb-friendly. */
function shortId(id: string): string {
  // If it looks like a UUID, show just the last 8 chars
  if (/^[0-9a-f-]{32,}$/i.test(id)) return `…${id.slice(-8)}`;
  return id;
}
