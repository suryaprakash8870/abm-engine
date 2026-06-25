'use client';

/**
 * PostHog product analytics + first-party signal layer.
 *
 * Inits the browser SDK from NEXT_PUBLIC_POSTHOG_* env vars (the key is a public
 * browser key — safe to ship). No-ops if the key is absent, so local/dev without
 * a key just renders children. Captures a pageview on every App Router navigation
 * (PostHog's auto-capture misses SPA route changes, so we fire $pageview ourselves).
 *
 * The pageview tracker uses useSearchParams, which must sit under a Suspense
 * boundary or it forces the whole tree to client-side render — hence the split.
 */

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let started = false;

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!KEY || !started) return;
    const qs = searchParams?.toString();
    posthog.capture('$pageview', {
      $current_url: window.location.origin + pathname + (qs ? `?${qs}` : ''),
    });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!KEY || started) return;
    posthog.init(KEY, {
      api_host: HOST,
      capture_pageview: false, // we fire $pageview manually on route change
      person_profiles: 'identified_only',
    });
    started = true;
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  );
}
