/**
 * Browser-side API client for Engine 04 (Scoring Engine).
 */

import type { ApiResult } from './icp-api';

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, data: body.data as T };
    return { ok: false, status: res.status, error: body.error ?? { code: 'UNKNOWN', message: res.statusText } };
  } catch (e) {
    return { ok: false, status: 0, error: { code: 'NETWORK', message: e instanceof Error ? e.message : 'network error' } };
  }
}

export interface ScoringCriterion {
  key: string;
  label: string;
  weight: number;
  rationale: string;
}

export interface ScoringFormula {
  id: string;
  icp_id: string;
  version: number;
  criteria: ScoringCriterion[];
  tier_boundaries: { tier1_min: number; tier2_min: number; tier3_min: number };
  is_fallback: boolean;
}

export interface AccountScore {
  account_id: string;
  total_score: number;
  tier: 1 | 2 | 3 | null; // null = untiered (scored below tier3_min)
  criterion_scores: { key: string; match: 0 | 0.5 | 1; weight: number; contribution: number }[];
  formula_version: number;
}

export interface TierDistribution {
  tier_1: number;
  tier_2: number;
  tier_3: number;
  total: number;
  override_count: number;
}

export const getFormula = (icpId: string) =>
  call<ScoringFormula>(`/api/v1/scoring/formula/icp/${icpId}`);

export const generateFormula = (icpId?: string) =>
  call<ScoringFormula>('/api/v1/scoring/generate-formula', {
    method: 'POST',
    body: JSON.stringify(icpId ? { icp_id: icpId } : {}),
  });

export const updateFormula = (formulaId: string, changes: Partial<Pick<ScoringFormula, 'criteria' | 'tier_boundaries'>>) =>
  call<ScoringFormula>(`/api/v1/scoring/formula/${formulaId}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });

export const runScoring = () =>
  call<{ queued: number; message: string }>('/api/v1/scoring/run', { method: 'POST' });

export const overrideTier = (accountId: string, tier: 1 | 2 | 3, reason: string) =>
  call<{ ok: boolean }>('/api/v1/scoring/override', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, tier, reason }),
  });

export const getDistribution = () =>
  call<TierDistribution>('/api/v1/scoring/distribution');
