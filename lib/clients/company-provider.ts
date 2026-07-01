/**
 * Company (TAM) data provider shim (Engine 02).
 *
 * One place that decides where company discovery comes from, so the TAM Builder
 * imports `searchCompanies` from HERE instead of a specific vendor.
 *
 * Cascade: Prospeo (when TAM_SOURCE=prospeo + PROSPEO_API_KEY) → on ANY error
 * falls back to Apollo → which itself falls back to the deterministic mock. So no
 * TAM_SOURCE=prospeo → behaves exactly as before. Full rollback = remove the env
 * var (config) or revert this file + the TAM Builder import (code).
 */

import * as apollo from './apollo';
import * as prospeo from './prospeo';

export type { ApolloSearchParams, ApolloCompany, ApolloSearchPage } from './apollo';

function useProspeo(): boolean {
  return process.env.TAM_SOURCE === 'prospeo' && !!process.env.PROSPEO_API_KEY;
}

export async function searchCompanies(
  params: apollo.ApolloSearchParams,
  page: number,
  perPage = 25,
  accountLimit = 1000,
): Promise<apollo.ApolloSearchPage> {
  if (useProspeo()) {
    try {
      return await prospeo.searchCompanies(params, page, perPage, accountLimit);
    } catch (e) {
      // Real mode: never fabricate mock companies — return an empty page (honest)
      // so a rate-limit/error surfaces as "no results", not fake accounts.
      console.warn(JSON.stringify({ level: 'warn', component: 'company-provider', msg: `Prospeo searchCompanies failed (${String(e)}) — no companies (real mode, no mock fallback).` }));
      return { companies: [], total: 0, page, perPage, hasMore: false, raw: {} };
    }
  }
  return apollo.searchCompanies(params, page, perPage, accountLimit);
}
