'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, Pill, Banner, LinkButton } from '../../icp/ui';
import {
  getTamAccounts,
  getEnrichmentAccounts,
  type RawAccountRow,
  type EnrichmentResult,
} from '@/lib/web/icp-api';

export default function AccountsPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId; // the TAM build id

  const [raw, setRaw] = useState<RawAccountRow[]>([]);
  const [enr, setEnr] = useState<EnrichmentResult | null>(null);
  const [icpId, setIcpId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTamAccounts(jobId)
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data) {
          setRaw(res.data.accounts);
          setIcpId(res.data.job.icpId);
        } else setError(res.error?.message ?? 'Failed to load accounts.');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [jobId]);

  // Poll enrichment until the enrichment job for this build completes.
  useEffect(() => {
    let active = true;
    let iv: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      const res = await getEnrichmentAccounts(jobId);
      if (!active) return;
      if (res.ok && res.data) {
        setEnr(res.data);
        if (res.data.job && res.data.job.status !== 'running' && iv) clearInterval(iv);
      }
    };
    void poll();
    iv = setInterval(poll, 3000);
    return () => {
      active = false;
      if (iv) clearInterval(iv);
    };
  }, [jobId]);

  if (loading) return <p className="text-sm text-white/40">Loading account list…</p>;
  if (error) {
    return (
      <div className="space-y-4">
        <Banner tone="red">{error}</Banner>
        <LinkButton href="/icp">Back</LinkButton>
      </div>
    );
  }

  const enriched = enr?.accounts ?? [];
  const showEnriched = enriched.length > 0;
  const total = showEnriched ? enriched.length : raw.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-medium text-white">Account list</h1>
        <Pill tone="green">{total} companies</Pill>
        {enr?.job && (
          <Pill tone="blue">
            {enr.job.qualifiedCount} qualified · {enr.job.disqualifiedCount} out
          </Pill>
        )}
        {!showEnriched && <span className="text-xs text-white/40">⏳ enriching + qualifying…</span>}
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Domain</th>
              {showEnriched ? (
                <>
                  <th className="px-4 py-3 font-medium">Industry</th>
                  <th className="px-4 py-3 font-medium">Employees</th>
                  <th className="px-4 py-3 font-medium">Fit</th>
                </>
              ) : (
                <th className="px-4 py-3 font-medium">Source</th>
              )}
            </tr>
          </thead>
          <tbody>
            {showEnriched
              ? enriched.map((a) => (
                  <tr key={a.account_id} className="border-b border-white/10 last:border-0 hover:bg-white/5" title={a.reason ?? ''}>
                    <td className="px-4 py-2.5 font-medium text-white/85">{a.name}</td>
                    <td className="px-4 py-2.5 text-white/60">{a.domain}</td>
                    <td className="px-4 py-2.5 text-white/70">{a.industry ?? '—'}</td>
                    <td className="px-4 py-2.5 text-white/70">{a.headcount ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {a.qualified === null ? (
                        <Pill>—</Pill>
                      ) : a.qualified ? (
                        <Pill tone="green">✓ qualified{a.confidence != null ? ` ${Math.round(a.confidence * 100)}%` : ''}</Pill>
                      ) : (
                        <Pill tone="red">✗ out</Pill>
                      )}
                    </td>
                  </tr>
                ))
              : raw.map((a) => (
                  <tr key={a.id} className="border-b border-white/10 last:border-0 hover:bg-white/5">
                    <td className="px-4 py-2.5 font-medium text-white/85">{a.name}</td>
                    <td className="px-4 py-2.5 text-white/60">{a.domain}</td>
                    <td className="px-4 py-2.5">
                      <Pill>{a.source}</Pill>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between border-t border-white/10 pt-6">
        <LinkButton href="/icp">← Back to ICP</LinkButton>
        {icpId ? (
          <LinkButton href={`/scoring/${icpId}`}>Score + tier →</LinkButton>
        ) : (
          <span className="text-sm text-white/35">Next: score + tier (Engine 04)</span>
        )}
      </div>
    </div>
  );
}
