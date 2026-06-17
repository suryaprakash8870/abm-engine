/**
 * Browser-side API client for the ICP Engine (Engine 01).
 *
 * Thin typed wrappers over /api/v1/icp/*. PHASE-0: auth is not wired yet, so we send
 * a dev `x-workspace-id` header (the foundation owner replaces this with the real
 * session). Every call returns a normalised { ok, status, data?, error }.
 */

export const DEV_WORKSPACE_ID = 'ws_demo';

const headers = {
  'Content-Type': 'application/json',
  'x-workspace-id': DEV_WORKSPACE_ID,
};

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { ...init, headers });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, data: body.data as T };
    return { ok: false, status: res.status, error: body.error ?? { code: 'UNKNOWN', message: res.statusText } };
  } catch (e) {
    return { ok: false, status: 0, error: { code: 'NETWORK', message: e instanceof Error ? e.message : 'network error' } };
  }
}

// ── Shapes (mirror the engine's IcpContent; kept local so the client bundle
//    never pulls in server-only engine code) ───────────────────────────────────

export interface IcpTemplate {
  id: string;
  name: string;
  description: string;
  defaults: { industries: string[]; employee_min: number; employee_max: number; business_model: string };
}

export interface IcpDefinition {
  icp_id: string;
  version: number;
  mode: string;
  firmographics: { industries: string[]; employee_min: number; employee_max: number; geographies: string[]; business_model: string };
  technographics: { required: string[]; preferred: string[]; excluded: string[] };
  signals: { high_intent: string[]; medium_intent: string[] };
  exclusions: { industries: string[]; disqualifiers: string[] };
  confidence_score: number;
  criteria_confidence: { firmographics: number; technographics: number; signals: number; exclusions: number };
}

// ── Calls ────────────────────────────────────────────────────────────────────

export const getTemplates = () => call<IcpTemplate[]>('/api/v1/icp/templates');

export const submitWizard = (answers: Record<string, string>) =>
  call<{ session_id: string; status: string }>('/api/v1/icp/wizard', {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });

export const getWizardStatus = (sessionId: string) =>
  call<{ status: string; icp_id: string | null; error: string | null }>(`/api/v1/icp/wizard/${sessionId}`);

export const getIcp = (id: string) => call<IcpDefinition>(`/api/v1/icp/${id}`);

export const updateIcp = (id: string, changes: Partial<IcpDefinition>) =>
  call<IcpDefinition>(`/api/v1/icp/${id}`, { method: 'PUT', body: JSON.stringify(changes) });

// ── Engine 02 (TAM Builder) ──────────────────────────────────────────────────

export interface TamLatest {
  job_id: string;
  status: string; // running | completed | failed
  total_found: number;
}

export const getLatestTam = (icpId: string) => call<TamLatest | null>(`/api/v1/tam/latest/${icpId}`);

export interface RawAccountRow {
  id: string;
  domain: string;
  name: string;
  source: string;
}

export const getTamAccounts = (jobId: string) =>
  call<{ count: number; accounts: RawAccountRow[] }>(`/api/v1/tam/accounts/${jobId}`);

// ── Engine 03 (Enrichment) ───────────────────────────────────────────────────

export interface EnrichedAccountRow {
  account_id: string;
  domain: string;
  name: string;
  industry: string | null;
  headcount: number | null;
  geography: string | null;
  qualified: boolean | null;
  confidence: number | null;
  reason: string | null;
}

export interface EnrichmentResult {
  job: { id: string; status: string; total: number; qualifiedCount: number; disqualifiedCount: number } | null;
  accounts: EnrichedAccountRow[];
}

/** Enriched + qualified accounts for a TAM build (keyed by the TAM job id). */
export const getEnrichmentAccounts = (sourceJobId: string) =>
  call<EnrichmentResult>(`/api/v1/enrichment/accounts/${sourceJobId}`);

/** Upload a company list (CSV parsed client-side) as a TAM build for an ICP. */
export const uploadCsvAccounts = (
  icpId: string,
  rows: Record<string, string>[],
  fieldMapping: { domain: string; name?: string },
) =>
  call<{ job_id: string; total: number }>('/api/v1/tam/upload', {
    method: 'POST',
    body: JSON.stringify({ icp_id: icpId, rows, field_mapping: fieldMapping }),
  });
