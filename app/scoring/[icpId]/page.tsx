'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, PrimaryButton, LinkButton, Banner, Pill, SectionTitle } from '@/app/icp/ui';
import {
  getFormula,
  generateFormula,
  updateFormula,
  runScoring,
  getDistribution,
  type ScoringFormula,
  type ScoringCriterion,
  type TierDistribution,
} from '@/lib/web/scoring-api';

const TIER_COLORS = { 1: 'text-emerald-300', 2: 'text-amber-300', 3: 'text-white/50' } as const;

export default function ScoringPage() {
  const { icpId } = useParams<{ icpId: string }>();

  const [formula, setFormula] = useState<ScoringFormula | null>(null);
  const [dist, setDist] = useState<TierDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [fRes, dRes] = await Promise.all([getFormula(icpId), getDistribution()]);
    if (fRes.ok && fRes.data) setFormula(fRes.data);
    else setError(fRes.error?.message ?? 'Failed to load formula.');
    if (dRes.ok && dRes.data) setDist(dRes.data);
    setLoading(false);
  }, [icpId]);

  useEffect(() => { void load(); }, [load]);

  const updateWeight = (key: string, weight: number) => {
    if (!formula) return;
    setFormula({
      ...formula,
      criteria: formula.criteria.map((c) => (c.key === key ? { ...c, weight } : c)),
    });
    setSaved(false);
  };

  const saveFormula = async () => {
    if (!formula) return;
    setSaving(true);
    setError(null);
    const total = formula.criteria.reduce((s, c) => s + c.weight, 0);
    if (Math.abs(total - 1) > 0.01) {
      setError(`Weights must sum to 1.0 (currently ${total.toFixed(2)}).`);
      setSaving(false);
      return;
    }
    const res = await updateFormula(formula.id, { criteria: formula.criteria });
    if (res.ok && res.data) { setFormula(res.data); setSaved(true); }
    else setError(res.error?.message ?? 'Save failed.');
    setSaving(false);
  };

  const handleRunScoring = async () => {
    setRunning(true);
    setError(null);
    const res = await runScoring();
    if (!res.ok) setError(res.error?.message ?? 'Failed to enqueue scoring job.');
    else setTimeout(() => { void getDistribution().then((d) => { if (d.ok && d.data) setDist(d.data); }); }, 3000);
    setRunning(false);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    const res = await generateFormula(icpId);
    if (res.ok && res.data) { setFormula(res.data); setSaved(false); }
    else setError(res.error?.message ?? 'Regeneration failed.');
    setRegenerating(false);
  };

  const weightTotal = formula ? formula.criteria.reduce((s, c) => s + c.weight, 0) : 0;
  const weightOk = Math.abs(weightTotal - 1) < 0.01;

  if (loading) return <p className="text-sm text-white/40">Loading scoring formula…</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium text-white">Scoring Formula</h1>
          <p className="mt-1 text-sm text-white/55">
            Adjust weights to change how accounts are scored. All weights must sum to 1.0.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LinkButton href={`/scoring/${icpId}/accounts`}>View scored accounts →</LinkButton>
        </div>
      </div>

      {error && <Banner tone="red">{error}</Banner>}
      {saved && <Banner tone="blue">Formula saved — run scoring to apply changes.</Banner>}

      {formula?.is_fallback && (
        <Banner tone="amber">
          Using an equal-weight fallback formula (Claude generation failed or not yet run).{' '}
          <button onClick={handleRegenerate} className="underline hover:no-underline" disabled={regenerating}>
            {regenerating ? 'Regenerating…' : 'Regenerate with AI'}
          </button>
        </Banner>
      )}

      {/* Tier distribution */}
      {dist && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([ ['Tier 1', dist.tier_1, 'emerald'], ['Tier 2', dist.tier_2, 'amber'], ['Tier 3', dist.tier_3, 'white'], ['Overrides', dist.override_count, 'blue'] ] as const).map(([label, count, color]) => (
            <Card key={label} className="text-center py-4">
              <p className={`text-2xl font-bold font-display text-${color}-300`}>{count}</p>
              <p className="mt-1 text-xs text-white/40">{label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Formula editor */}
      {formula && (
        <Card className="space-y-6">
          <div className="flex items-center justify-between">
            <SectionTitle>Criteria & Weights</SectionTitle>
            <span className={`text-xs tabular-nums ${weightOk ? 'text-emerald-400' : 'text-red-400'}`}>
              Total: {weightTotal.toFixed(2)} / 1.00
            </span>
          </div>

          <div className="space-y-5">
            {formula.criteria.map((c) => (
              <CriterionRow key={c.key} criterion={c} onWeightChange={(w) => updateWeight(c.key, w)} />
            ))}
          </div>

          <div className="flex items-center gap-3 border-t border-white/10 pt-5">
            <PrimaryButton onClick={saveFormula} disabled={saving || !formula}>
              {saving ? 'Saving…' : 'Save formula'}
            </PrimaryButton>
            <PrimaryButton onClick={handleRunScoring} disabled={running}>
              {running ? 'Queuing…' : 'Run scoring now'}
            </PrimaryButton>
            <button onClick={handleRegenerate} disabled={regenerating} className="text-sm text-white/40 hover:text-white transition">
              {regenerating ? 'Regenerating…' : '↺ Regenerate with AI'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Pill tone="blue">v{formula.version}</Pill>
            {formula.is_fallback && <Pill tone="amber">fallback</Pill>}
            <span className="text-xs text-white/30">ICP {icpId.slice(0, 8)}…</span>
          </div>
        </Card>
      )}

      {/* Tier boundaries */}
      {formula && (
        <Card className="space-y-4">
          <SectionTitle>Tier Boundaries</SectionTitle>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {([
              ['Tier 1', formula.tier_boundaries.tier1_min, '≥', 'emerald'],
              ['Tier 2', formula.tier_boundaries.tier2_min, '≥', 'amber'],
              ['Tier 3', formula.tier_boundaries.tier3_min, '≥', 'white'],
            ] as const).map(([label, val, sym, color]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                <p className={`text-lg font-bold text-${color}-300`}>{sym}{val}</p>
                <p className="mt-1 text-xs text-white/40">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/30">Boundaries are configurable via the API (PUT /api/v1/scoring/formula/:id).</p>
        </Card>
      )}
    </div>
  );
}

function CriterionRow({
  criterion,
  onWeightChange,
}: {
  criterion: ScoringCriterion;
  onWeightChange: (w: number) => void;
}) {
  const pct = Math.round(criterion.weight * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{criterion.label}</p>
          <p className="mt-0.5 text-xs text-white/40 truncate">{criterion.rationale}</p>
        </div>
        <span className="w-12 shrink-0 text-right text-sm tabular-nums text-white/70">{pct}%</span>
      </div>
      <input
        type="range"
        min={5}
        max={60}
        step={1}
        value={pct}
        onChange={(e) => onWeightChange(Number(e.target.value) / 100)}
        className="w-full accent-blue-500"
      />
    </div>
  );
}
