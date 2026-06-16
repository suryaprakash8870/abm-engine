'use client';

/**
 * ICP landing / mode-select page.
 *
 * Lets the user pick how to build their Ideal Customer Profile (wizard / CRM
 * analysis / CSV import) and seed from an industry template. Templates are
 * fetched client-side on mount via getTemplates().
 */

import { useEffect, useState } from 'react';
import { Banner, Card, ChipList, LinkButton, Pill, SectionTitle } from './ui';
import { getTemplates, type IcpTemplate } from '@/lib/web/icp-api';

export default function IcpLandingPage() {
  const [templates, setTemplates] = useState<IcpTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getTemplates()
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data) {
          setTemplates(res.data);
        } else {
          setError(res.error?.message ?? 'Failed to load templates.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">Build your Ideal Customer Profile</h1>
        <p className="text-sm text-gray-600">
          Choose how you want to define your ICP — answer a few questions, learn from your CRM, or import past deals.
        </p>
      </header>

      {/* Mode select */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900">Hypothesis wizard</h3>
            <Pill tone="green">Ready</Pill>
          </div>
          <p className="mt-1 flex-1 text-sm text-gray-600">12 quick questions, no data needed.</p>
          <div className="mt-4">
            <LinkButton href="/icp/wizard">Start wizard</LinkButton>
          </div>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900">CRM analysis</h3>
            <Pill tone="amber">Needs CRM (Engine 10)</Pill>
          </div>
          <p className="mt-1 flex-1 text-sm text-gray-600">Learn your ICP from closed-won/lost deals.</p>
          <div className="mt-4">
            <span className="inline-block cursor-not-allowed rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400">
              Connect a CRM to enable
            </span>
          </div>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900">CSV import</h3>
            <Pill tone="blue">API ready</Pill>
          </div>
          <p className="mt-1 flex-1 text-sm text-gray-600">Upload a deal export; we infer the ICP.</p>
          <div className="mt-4">
            <span className="inline-block rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400">
              UI upload coming soon
            </span>
          </div>
        </Card>
      </div>

      {/* Templates */}
      <section className="space-y-4">
        <SectionTitle>Seed from an industry template</SectionTitle>

        {loading && <p className="text-sm text-gray-500">Loading templates…</p>}

        {!loading && error && <Banner tone="red">{error}</Banner>}

        {!loading && !error && templates && templates.length === 0 && (
          <p className="text-sm text-gray-400">No templates available.</p>
        )}

        {!loading && !error && templates && templates.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {templates.map((t) => (
              <Card key={t.id} className="flex flex-col">
                <p className="font-semibold text-gray-900">{t.name}</p>
                <p className="mt-1 text-sm text-gray-600">{t.description}</p>
                <div className="mt-3 flex-1">
                  <ChipList items={t.defaults.industries} />
                </div>
                <div className="mt-4">
                  <LinkButton href={`/icp/wizard?template=${t.id}`}>Use template</LinkButton>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
