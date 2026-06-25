'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, LinkButton, Banner } from '@/app/icp/ui';
import { listIcps } from '@/lib/web/icp-api';

/**
 * /scoring index — there's one scoring formula per ICP, so this page resolves
 * which ICP to score:
 *   - 1+ ICPs → auto-redirect to /scoring/[first.icp_id]
 *   - 0 ICPs → "Build an ICP first" empty state with a CTA
 */
export default function ScoringIndexPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let active = true;
    listIcps().then((res) => {
      if (!active) return;
      if (res.ok && res.data && res.data.length > 0) {
        router.replace(`/scoring/${res.data[0].icp_id}`);
        return;
      }
      if (res.ok) setEmpty(true);
      else setError(res.error?.message ?? 'Failed to load ICPs.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  if (loading) return <p className="text-sm text-white/40">Loading scoring…</p>;
  if (error) return <Banner tone="red">{error}</Banner>;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-medium text-white">Scoring</h1>
        <p className="text-sm text-white/55">
          Scoring uses your ICP rubric to give every account a fit score and a tier.
        </p>
      </header>

      {empty && (
        <Card className="space-y-4">
          <p className="font-medium text-white/85">No ICP yet.</p>
          <p className="text-sm text-white/60">
            Build an Ideal Customer Profile first — scoring derives its rubric (criteria, weights, tier boundaries) from the ICP.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/icp/wizard"
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-[0_8px_24px_-12px_rgba(197,251,80,0.55)] transition hover:bg-accent-hover"
            >
              Build an ICP →
            </Link>
            <LinkButton href="/demo">How it works</LinkButton>
          </div>
        </Card>
      )}
    </div>
  );
}
