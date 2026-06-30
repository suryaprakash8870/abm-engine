'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, SectionTitle, Pill, ChipList, ConfidenceBar, LinkButton, NextEngineButton, Banner } from '../ui';
import { getIcp, getLatestTam, type IcpDefinition, type TamLatest } from '@/lib/web/icp-api';

/** Live status of the auto-triggered TAM build (Engine 02) for this ICP. */
function TamSection({ icpId }: { icpId: string }) {
  const [tam, setTam] = useState<TamLatest | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    let iv: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      const res = await getLatestTam(icpId);
      if (!active) return;
      setLoaded(true);
      const data = res.ok ? res.data ?? null : null;
      setTam(data);
      if (data && (data.status === 'completed' || data.status === 'failed') && iv) clearInterval(iv);
    };
    void poll();
    iv = setInterval(poll, 3000);
    return () => {
      active = false;
      if (iv) clearInterval(iv);
    };
  }, [icpId]);

  return (
    <Card className="space-y-2">
      <SectionTitle>Account list · Engine 02</SectionTitle>
      {!loaded && <p className="text-sm text-white/40">Checking…</p>}
      {loaded && !tam && (
        <p className="text-sm text-white/50">Sourcing starts automatically when the ICP is created.</p>
      )}
      {tam?.status === 'running' && <p className="text-sm text-white/60">⏳ Building your account list…</p>}
      {tam?.status === 'failed' && <Banner tone="red">Account-list build failed.</Banner>}
      {tam?.status === 'completed' && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/80">
            <strong>{tam.total_found}</strong> matching companies found.
          </span>
          <LinkButton href={`/accounts/${tam.job_id}`}>View account list →</LinkButton>
        </div>
      )}
      <div className="pt-1">
        <a href={`/tam/upload?icp=${icpId}`} className="text-xs text-white/45 underline hover:text-white/70">
          or upload your own company list (CSV)
        </a>
      </div>
    </Card>
  );
}

/** A labelled row that pairs a small caption with a ChipList. */
function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-white/40">{label}</div>
      <ChipList items={items} />
    </div>
  );
}

export default function IcpReviewPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [icp, setIcp] = useState<IcpDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getIcp(id)
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data) {
          setIcp(res.data);
        } else {
          setIcp(null);
          setError(res.error?.message ?? 'Failed to load ICP.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <p className="text-sm text-white/40">Loading ICP…</p>;
  }

  if (error || !icp) {
    return (
      <div className="space-y-4">
        <Banner tone="red">{error ?? 'ICP not found.'}</Banner>
        <LinkButton href="/icp">Back</LinkButton>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-medium text-white">Your ICP</h1>
            <Pill tone="blue">{icp.mode}</Pill>
            <Pill tone="gray">v{icp.version}</Pill>
          </div>
          <a
            href={`/icp/wizard?refine=${id}`}
            className="shrink-0 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
          >
            Refine ICP →
          </a>
        </div>
        <ConfidenceBar value={icp.confidence_score} label="Overall confidence" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="space-y-4">
          <SectionTitle>Firmographics</SectionTitle>
          <ConfidenceBar value={icp.criteria_confidence.firmographics} label="confidence" />
          <ChipRow label="Industries" items={icp.firmographics.industries} />
          <div className="text-sm text-white/70">
            Employees: {icp.firmographics.employee_min}–{icp.firmographics.employee_max}
          </div>
          <ChipRow label="Geographies" items={icp.firmographics.geographies} />
          <div className="text-sm text-white/70">Business model: {icp.firmographics.business_model}</div>
        </Card>

        <Card className="space-y-4">
          <SectionTitle>Technographics</SectionTitle>
          <ConfidenceBar value={icp.criteria_confidence.technographics} label="confidence" />
          <ChipRow label="Required" items={icp.technographics.required} />
          <ChipRow label="Preferred" items={icp.technographics.preferred} />
          <ChipRow label="Excluded" items={icp.technographics.excluded} />
        </Card>

        <Card className="space-y-4">
          <SectionTitle>Signals</SectionTitle>
          <ConfidenceBar value={icp.criteria_confidence.signals} label="confidence" />
          <ChipRow label="High-intent" items={icp.signals.high_intent} />
          <ChipRow label="Medium-intent" items={icp.signals.medium_intent} />
        </Card>

        <Card className="space-y-4">
          <SectionTitle>Exclusions</SectionTitle>
          <ConfidenceBar value={icp.criteria_confidence.exclusions} label="confidence" />
          <ChipRow label="Industries" items={icp.exclusions.industries} />
          <ChipRow label="Disqualifiers" items={icp.exclusions.disqualifiers} />
        </Card>
      </div>

      <div className="space-y-4 border-t border-white/10 pt-6">
        <TamSection icpId={id} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LinkButton href="/icp">← Back</LinkButton>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/35">Next: TAM Builder (Engine 02)</span>
            <NextEngineButton href="/tal">Open Account List</NextEngineButton>
          </div>
        </div>
      </div>
    </div>
  );
}
