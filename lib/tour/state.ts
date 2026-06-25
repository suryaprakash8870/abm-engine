/**
 * Tour state — persisted in localStorage so the step survives page navigation.
 * Tiny API: read / start / advance / exit. All ops are no-ops during SSR.
 */

import { TOUR_TOTAL } from './config';

const KEY = 'abm_tour_step';

export function getTourStep(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > TOUR_TOTAL) return null;
  return n;
}

export function setTourStep(step: number): void {
  if (typeof window === 'undefined') return;
  if (step < 1 || step > TOUR_TOTAL) {
    window.localStorage.removeItem(KEY);
    return;
  }
  window.localStorage.setItem(KEY, String(step));
  // Custom event so any TourBanner mounted elsewhere on the page can react
  // (in practice there's only one, but the listener pattern keeps it clean).
  window.dispatchEvent(new CustomEvent('abm-tour-changed', { detail: { step } }));
}

export function exitTour(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('abm-tour-changed', { detail: { step: null } }));
}
