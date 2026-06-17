/**
 * Shared presentational primitives — dark "Gemini" theme. No hooks, so they're
 * safe in both server and client components. Imported across icp / accounts /
 * tam / auth, so restyling here propagates the theme app-wide.
 */

import Link from 'next/link';

/** Glass card: translucent surface over the breathing-glow canvas. */
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl shadow-black/20 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{children}</h2>;
}

export function Pill({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode;
  tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const tones: Record<string, string> = {
    gray: 'bg-white/10 text-white/70',
    green: 'bg-emerald-400/15 text-emerald-300',
    amber: 'bg-amber-400/15 text-amber-300',
    red: 'bg-red-400/15 text-red-300',
    blue: 'bg-blue-400/15 text-blue-300',
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function ChipList({ items, empty = '—' }: { items: string[]; empty?: string }) {
  if (!items || items.length === 0) return <span className="text-sm text-white/30">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="rounded-md border border-white/5 bg-white/[0.06] px-2 py-1 text-sm text-white/75">
          {i}
        </span>
      ))}
    </div>
  );
}

/** Green ≥ 0.7, amber ≥ 0.4, else red — matches the doc's confidence colours. */
export function ConfidenceBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const color = value >= 0.7 ? 'bg-emerald-400' : value >= 0.4 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div title={`confidence: ${pct}%`}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-white/40">
          <span>{label}</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Blue-accent primary action (form submits, main CTAs). */
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
      className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
    >
      {children}
    </button>
  );
}

/** Neutral glass link-button (navigation, secondary CTAs, Back). */
export function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/10"
    >
      {children}
    </Link>
  );
}

export function Banner({ tone = 'red', children }: { tone?: 'red' | 'amber' | 'blue'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    red: 'border-red-400/25 bg-red-500/10 text-red-200',
    amber: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
    blue: 'border-blue-400/25 bg-blue-500/10 text-blue-100',
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

/** Shared form-field classes so inputs/selects match the dark theme everywhere. */
export const inputClass =
  'w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-white/30 focus:bg-white/[0.09]';

/** Selects: same shell, plus dark option styling for browsers that honour it. */
export const selectClass = `${inputClass} [&>option]:bg-[#15171f] [&>option]:text-white`;
