'use client';

import { useEffect, useState } from 'react';
import { Card, Pill, Banner, LinkButton, WhatsNext } from '@/app/icp/ui';
import {
  getPipeline, getCorrelation, getFlywheelMetrics, getAttribution,
  type PipelineData, type CorrelationData, type MetricsData, type AttributionDeal,
} from '@/lib/web/flywheel-api';

const TIERS = ['1', '2', '3'];
const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`);

function TierTable({ title, map, fmt }: { title: string; map: Record<string, number>; fmt: (n: number) => string }) {
  return (
    <Card className="space-y-2 p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{title}</p>
      <div className="grid grid-cols-3 gap-2">
        {TIERS.map((t) => (
          <div key={t} className="rounded-lg bg-white/5 px-2 py-2 text-center">
            <p className="text-[11px] text-white/40">Tier {t}</p>
            <p className="text-sm font-medium text-white/85 tabular-nums">{fmt(map?.[t] ?? 0)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function InsightsPage() {
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [attribution, setAttribution] = useState<AttributionDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [p, c, m, a] = await Promise.all([getPipeline(), getCorrelation(), getFlywheelMetrics(), getAttribution()]);
      if (p.ok) setPipeline(p.data ?? null); else setError(p.error?.message ?? 'Failed to load.');
      if (c.ok) setCorrelation(c.data ?? null);
      if (m.ok) setMetrics(m.data ?? null);
      if (a.ok) setAttribution(a.data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-sm text-white/40">Loading insights…</p>;

  const latest = pipeline?.latest;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-medium text-white">Analytics</h1>
        {metrics && <Pill tone="green">{metrics.closed_won} won</Pill>}
        {metrics && metrics.closed_lost > 0 && <Pill tone="red">{metrics.closed_lost} lost</Pill>}
      </div>
      {error && <Banner tone="red">{error}</Banner>}

      {/* Pipeline by tier */}
      {latest ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TierTable title="Pipeline (won)" map={latest.pipeline_by_tier} fmt={money} />
          <TierTable title="Win rate" map={latest.win_rate_by_tier} fmt={(n) => `${Math.round(n * 100)}%`} />
          <TierTable title="Avg deal size" map={latest.avg_deal_size_by_tier} fmt={money} />
          <TierTable title="Days to close" map={latest.days_to_close_by_tier} fmt={(n) => `${n}d`} />
        </div>
      ) : (
        <Banner tone="blue">No closed deals yet. Pipeline metrics appear once deals close (Engine 10 → here).</Banner>
      )}

      {/* Signal correlation */}
      <Card className="space-y-3">
        <h2 className="text-sm font-medium text-white/85">Signal correlation</h2>
        {!correlation?.has_enough_data ? (
          <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
            More data needed — correlation is suppressed below {correlation?.needed ?? 20} closed deals
            <span className="text-white/30"> (have {correlation?.sample_size ?? 0})</span>.
          </div>
        ) : (
          <div className="space-y-1.5">
            {correlation.combinations.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm">
                <span className="text-white/75">{c.signal_combination.join(' + ').replace(/_/g, ' ')}</span>
                <Pill tone="blue">{Math.round(c.correlation_score * 100)}%</Pill>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Attribution */}
      {attribution.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-sm font-medium text-white/85">Multi-touch attribution</h2>
          {attribution.slice(0, 5).map((d) => (
            <div key={d.deal_id} className="rounded-lg border border-white/10 px-3 py-2">
              <p className="text-xs text-white/40">{d.deal_id} · {d.touches.length} touches</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {d.touches.slice(0, 12).map((t, i) => (
                  <span key={i} className={`rounded px-1.5 py-0.5 text-[11px] ${t.touch_type === 'play' ? 'bg-blue-500/15 text-blue-200' : 'bg-emerald-500/15 text-emerald-200'}`}>
                    {(t.subtype ?? t.touch_type).replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      <WhatsNext auto="Every win and loss here automatically sharpens your ICP — that's the GTM flywheel." cta={{ label: 'Refine your ICP', href: '/icp' }} />
    </div>
  );
}
