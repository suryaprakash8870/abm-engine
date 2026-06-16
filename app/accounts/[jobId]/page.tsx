'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, Pill, Banner, LinkButton } from '../../icp/ui';
import { getTamAccounts, type RawAccountRow } from '@/lib/web/icp-api';

export default function AccountsPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [accounts, setAccounts] = useState<RawAccountRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTamAccounts(jobId)
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data) {
          setAccounts(res.data.accounts);
          setCount(res.data.count);
        } else {
          setError(res.error?.message ?? 'Failed to load accounts.');
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [jobId]);

  if (loading) return <p className="text-sm text-gray-500">Loading account list…</p>;
  if (error) {
    return (
      <div className="space-y-4">
        <Banner tone="red">{error}</Banner>
        <LinkButton href="/icp">Back</LinkButton>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Account list</h1>
        <Pill tone="green">{count} companies</Pill>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-800">{a.name}</td>
                <td className="px-4 py-2.5 text-gray-600">{a.domain}</td>
                <td className="px-4 py-2.5">
                  <Pill>{a.source}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between border-t pt-6">
        <LinkButton href="/icp">← Back to ICP</LinkButton>
        <span className="text-sm text-gray-400">Next: enrich + qualify (Engine 03)</span>
      </div>
    </div>
  );
}
