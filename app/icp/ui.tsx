/**
 * Shared presentational primitives for the ICP UI. No hooks — safe to use from
 * both server and client components. Keep the whole ICP section visually consistent.
 */

import Link from 'next/link';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border bg-white p-6 shadow-sm ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{children}</h2>;
}

export function Pill({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue' }) {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function ChipList({ items, empty = '—' }: { items: string[]; empty?: string }) {
  if (!items || items.length === 0) return <span className="text-sm text-gray-400">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="rounded-md bg-gray-100 px-2 py-1 text-sm text-gray-700">
          {i}
        </span>
      ))}
    </div>
  );
}

/** Green ≥ 0.7, amber ≥ 0.4, else red — matches the doc's confidence colours. */
export function ConfidenceBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const color = value >= 0.7 ? 'bg-green-500' : value >= 0.4 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div title={`confidence: ${pct}%`}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
      {children}
    </Link>
  );
}

export function Banner({ tone = 'red', children }: { tone?: 'red' | 'amber' | 'blue'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    red: 'border-red-200 bg-red-50 text-red-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}
