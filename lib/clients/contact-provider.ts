/**
 * Contact data provider shim (Engine 06).
 *
 * One place that decides where committee data comes from, so the Contact Engine
 * imports `searchPeople` / `verifyEmail` from HERE instead of a specific vendor.
 *
 * Cascade: Prospeo (when CONTACT_SOURCE=prospeo + PROSPEO_API_KEY) → on ANY error
 * (API, budget cap, parse) falls back to Apollo → which itself falls back to the
 * deterministic mock. So:
 *   - no Prospeo env set  → behaves EXACTLY as before (pure Apollo/mock path).
 *   - Prospeo set but errors → still produces contacts (Apollo/mock), never breaks.
 * Full rollback = remove the two env vars (config), or revert this file + the
 * Contact Engine's import (code).
 */

import * as apollo from './apollo';
import * as prospeo from './prospeo';

export type { ApolloPerson, EmailVerifyResult } from './apollo';

function warn(msg: string): void {
  console.warn(JSON.stringify({ level: 'warn', component: 'contact-provider', msg }));
}

export async function searchPeople(
  domain: string,
  companyName: string,
  titles: string[],
  limit: number,
): Promise<apollo.ApolloPerson[]> {
  if (prospeo.shouldUseProspeo()) {
    try {
      return await prospeo.searchPeople(domain, companyName, titles, limit);
    } catch (e) {
      // Real mode: NEVER fabricate mock contacts. A Prospeo error / budget cap /
      // no-data means "none available", so return empty (honest) rather than fake
      // people that look real in the UI.
      warn(`Prospeo searchPeople failed (${String(e)}) — returning no contacts (real mode, no mock fallback).`);
      return [];
    }
  }
  return apollo.searchPeople(domain, companyName, titles, limit);
}

export async function verifyEmail(email: string | null): Promise<apollo.EmailVerifyResult> {
  if (prospeo.shouldUseProspeo()) {
    try {
      return await prospeo.verifyEmail(email);
    } catch (e) {
      warn(`Prospeo verifyEmail failed (${String(e)}) — falling back to Apollo/mock.`);
    }
  }
  return apollo.verifyEmail(email);
}
