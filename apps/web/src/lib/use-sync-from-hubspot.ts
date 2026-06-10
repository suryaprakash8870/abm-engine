'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, getDevOrgId } from './api-client';

export interface SyncProgress {
  step: 'fetching' | 'upserting' | 'scoring' | 'done';
  current: number;
  total: number;
  percent: number;
  message: string;
}

interface JobStatus {
  id?: string;
  state?: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | string;
  progress?: SyncProgress | number;
  returnvalue?: unknown;
  failedReason?: string;
  attemptsMade?: number;
}

/**
 * One sync hook used by both the landing page and the /accounts page.
 *
 * It enqueues the BullMQ sync job, then polls every 800ms to surface live
 * progress (step + percent + "12 of 28" counter) until the job ends. On
 * success it invalidates both the accounts list and any landing-page stats
 * so the UI refreshes without a manual reload.
 *
 * UI_FLOW.md §"Progress UX": progress text reads like a sentence the
 * customer would say, not a job name.
 */
export function useSyncFromHubspot() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      setProgress({
        step: 'fetching',
        current: 0,
        total: 0,
        percent: 0,
        message: 'Starting sync…',
      });
      const orgId = getDevOrgId();
      const job = await apiFetch<{ jobId: string }>('/api/dev/sync/accounts', {
        method: 'POST',
        body: JSON.stringify({ orgId }),
      });

      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 800));
        const status = await apiFetch<JobStatus>(
          `/api/dev/sync/jobs/${encodeURIComponent(job.jobId)}`,
        );
        if (status.progress && typeof status.progress === 'object') {
          setProgress(status.progress);
        }
        if (status.state === 'completed') {
          setProgress({
            step: 'done',
            current: 0,
            total: 0,
            percent: 100,
            message: 'Sync complete.',
          });
          return status;
        }
        if (status.state === 'failed') {
          throw new Error(status.failedReason ?? 'Sync failed');
        }
      }
      throw new Error('Sync timed out');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['accounts', 'summary'] });
    },
  });

  return { ...mutation, progress };
}
