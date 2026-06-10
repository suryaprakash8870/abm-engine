'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';

const ORG_ID = process.env.NEXT_PUBLIC_DEV_ORG_ID!;

export function useSeedAccounts() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch<{ seeded: number; scored: number }>('/api/dev/seed/accounts', {
        method: 'POST',
        body: JSON.stringify({ orgId: ORG_ID }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['accounts', 'summary'] });
    },
  });
}
