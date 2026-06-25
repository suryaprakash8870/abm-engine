'use client';

/**
 * Shared client-side pagination — a hook + a presentational control, used by
 * every data table in the app so they paginate identically.
 *
 *   const pg = usePagination(rows, 25);
 *   ...render pg.pageItems...
 *   <Pagination {...pg} unit="accounts" />
 *
 * The control renders nothing when everything fits on one page, so small tables
 * are visually unaffected.
 */

import { useEffect, useMemo, useState } from 'react';

export interface PaginationState<T> {
  page: number;
  setPage: (p: number) => void;
  pageItems: T[];
  totalPages: number;
  total: number;
  start: number; // 0-based index of first item on the page
  end: number;   // 1-based index of last item on the page
  pageSize: number;
}

export function usePagination<T>(items: T[], pageSize = 25): PaginationState<T> {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // If the underlying list shrinks (e.g. a filter is applied) and the current
  // page no longer exists, snap back to page 1.
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);

  return {
    page: safePage,
    setPage,
    pageItems,
    totalPages,
    total,
    start,
    end: Math.min(start + pageSize, total),
    pageSize,
  };
}

export function Pagination<T>({
  page,
  setPage,
  totalPages,
  total,
  start,
  end,
  unit = 'rows',
}: PaginationState<T> & { unit?: string }) {
  if (totalPages <= 1) return null;

  const btn =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] px-2.5 text-[12.5px] font-medium text-white/75 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-3">
      <p className="text-[12px] text-white/45">
        Showing <span className="tabular-nums text-white/70">{start + 1}</span>–
        <span className="tabular-nums text-white/70">{end}</span> of{' '}
        <span className="tabular-nums text-white/70">{total}</span> {unit}
      </p>
      <div className="flex items-center gap-1.5">
        <button onClick={() => setPage(1)} disabled={page === 1} className={btn} aria-label="First page">«</button>
        <button onClick={() => setPage(page - 1)} disabled={page === 1} className={btn} aria-label="Previous page">‹ Prev</button>
        <span className="px-2 text-[12px] text-white/55 tabular-nums">
          Page {page} / {totalPages}
        </span>
        <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className={btn} aria-label="Next page">Next ›</button>
        <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className={btn} aria-label="Last page">»</button>
      </div>
    </div>
  );
}
