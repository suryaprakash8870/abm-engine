import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client. Reads the anon key — RLS still applies and the
 * server resolves org_id from the user's session before any tenant-scoped
 * query runs.
 *
 * Phase 0 ships the client without any auth UI yet. Sign-in lands in Phase 1.
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not configured',
    );
  }
  return createBrowserClient(url, anon);
}
