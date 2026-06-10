'use client';

import type { SyncProgress } from '@/lib/use-sync-from-hubspot';

/**
 * Progress bar + step label for the HubSpot sync job. Receives the latest
 * SyncProgress emitted by the BullMQ job (forwarded through the dev
 * status endpoint).
 *
 * Visual contract:
 *  - A percentage bar (0–100) that smooths across the whole pipeline,
 *    not just within a single step
 *  - A line of human-readable text ("Scoring accounts — 12 of 28")
 *  - No code/job/queue language — UI_FLOW.md §"Progress UX"
 */
export function SyncProgressBar({ progress }: { progress: SyncProgress | null }) {
  if (!progress) return null;
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
        <span>{progress.message}</span>
        <span className="tabular-nums">{progress.percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full rounded-full bg-neutral-900 transition-[width] duration-300 ease-out dark:bg-white"
          style={{ width: `${Math.max(2, Math.min(100, progress.percent))}%` }}
        />
      </div>
    </div>
  );
}
