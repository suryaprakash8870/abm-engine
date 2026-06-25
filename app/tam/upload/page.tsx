'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, PrimaryButton, Banner, LinkButton, inputClass, selectClass } from '../../icp/ui';
import { uploadCsvAccounts } from '@/lib/web/icp-api';

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = parseLine(line);
    const r: Record<string, string> = {};
    headers.forEach((h, i) => (r[h] = vals[i] ?? ''));
    return r;
  });
  return { headers, rows };
}

const guess = (headers: string[], re: RegExp) => headers.find((h) => re.test(h)) ?? '';

function CsvUploadInner() {
  const router = useRouter();
  const icpId = useSearchParams().get('icp') ?? '';

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [domainCol, setDomainCol] = useState('');
  const [nameCol, setNameCol] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) {
      setError('Could not parse that file as CSV.');
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setDomainCol(guess(parsed.headers, /domain|website|url/i));
    setNameCol(guess(parsed.headers, /company|organization|account|^name$/i));
  };

  const canSubmit = useMemo(() => !!icpId && !!domainCol && rows.length > 0 && !submitting, [icpId, domainCol, rows, submitting]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const res = await uploadCsvAccounts(icpId, rows, { domain: domainCol, name: nameCol || undefined });
    if (res.ok && res.data) {
      router.push(`/accounts/${res.data.job_id}`);
    } else {
      setError(res.error?.message ?? 'Upload failed.');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-white">Upload your company list</h1>
        <p className="mt-1 text-sm text-white/55">
          Export companies from Apollo (or any source) as CSV and upload here — they flow through the same
          enrichment + qualification as Apollo-sourced accounts.
        </p>
      </div>

      {!icpId && <Banner tone="amber">Open this from an ICP page so the upload is linked to an ICP.</Banner>}
      {error && <Banner tone="red">{error}</Banner>}

      <Card className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-white/70">CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="block w-full text-sm text-white/60 file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-accent-foreground hover:file:bg-accent-hover"
          />
        </div>

        {headers.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-white/70">
                Domain / website column <span className="text-red-300">*</span>
              </label>
              <select value={domainCol} onChange={(e) => setDomainCol(e.target.value)} className={selectClass}>
                <option value="">Select…</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-white/70">Company name column</label>
              <select value={nameCol} onChange={(e) => setNameCol(e.target.value)} className={selectClass}>
                <option value="">(optional)</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {rows.length > 0 && <p className="text-sm text-white/40">{rows.length} rows detected.</p>}

        <div className="flex items-center gap-3">
          <PrimaryButton onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Uploading…' : 'Build account list'}
          </PrimaryButton>
          <LinkButton href={icpId ? `/icp/${icpId}` : '/icp'}>← Back</LinkButton>
        </div>
      </Card>
    </div>
  );
}

export default function CsvUploadPage() {
  // useSearchParams() requires a Suspense boundary for the production build.
  return (
    <Suspense fallback={null}>
      <CsvUploadInner />
    </Suspense>
  );
}
