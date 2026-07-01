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
      className={`relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)] backdrop-blur-xl ${className}`}
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

/** Lime-accent primary action (form submits, main CTAs). */
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
      className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-[0_0_0_1px_rgba(197,251,80,0.25),0_8px_24px_-12px_rgba(197,251,80,0.55)] transition hover:bg-accent-hover hover:shadow-[0_0_0_1px_rgba(197,251,80,0.4),0_10px_30px_-10px_rgba(197,251,80,0.7)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
    >
      {children}
    </button>
  );
}

/**
 * Footer CTA used at the bottom of every engine page to advance to the next
 * engine. Lime accent + arrow so it reads as the primary "what to do next".
 */
export function NextEngineButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-[0_8px_24px_-12px_rgba(197,251,80,0.55)] transition hover:bg-accent-hover"
    >
      {children}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

/**
 * "What happens next" footer hint. Replaces the old engine-to-engine "Next"
 * stepper with business-language guidance: what the platform now does
 * automatically, plus an optional link to the next thing the user might review.
 */
export function WhatsNext({ auto, cta }: { auto: string; cta?: { label: string; href: string } }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
      <p className="flex items-center gap-2.5 text-[13px] text-white/55">
        <span className="text-accent">✶</span>
        <span><span className="font-medium text-white/75">What happens next:</span> {auto}</span>
      </p>
      {cta && (
        <Link href={cta.href} className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-accent transition hover:text-accent-hover">
          {cta.label}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
        </Link>
      )}
    </div>
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

/**
 * Centered modal dialog. Renders a dimmed, click-to-dismiss backdrop with the
 * panel floating in the viewport centre — so row actions (suppress, override)
 * open in place instead of shifting the page to a bar above the table.
 * Hook-free: closing is driven by the backdrop click + the caller's Cancel button.
 */
export function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
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
