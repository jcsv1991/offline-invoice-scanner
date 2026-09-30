import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { SyncStatus } from '../lib/types';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 active:bg-teal-900 disabled:bg-slate-300 disabled:text-slate-500',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50',
  ghost: 'text-teal-800 hover:bg-teal-50 active:bg-teal-100 disabled:opacity-50',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-amber-700">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-2 focus:outline-teal-600/30';

/**
 * Numeric input that keeps what you are typing ("1.", "0.5") instead of snapping to a number
 * on every keystroke, while still reporting a clean number to the parent.
 */
export function NumberField({
  value,
  onChange,
  id,
  label,
  className = '',
  step = '0.01',
  decimals,
}: {
  value: number;
  onChange: (n: number) => void;
  id: string;
  label: string;
  className?: string;
  step?: string;
  /** Show money-style fixed decimals (28.50, not 28.5) whenever the person is not mid-typing. */
  decimals?: number;
}) {
  const fmt = (n: number) => (decimals === undefined ? String(n) : n.toFixed(decimals));
  const [text, setText] = useState(fmt(value));

  useEffect(() => {
    // Re-sync only when the outside value really differs from what the typed text means.
    if (parseFloat(text || '0') !== value) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      id={id}
      aria-label={label}
      className={`${inputClass} px-2 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${className}`}
      type="number"
      inputMode="decimal"
      step={step}
      min="0"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      onBlur={() => setText(fmt(value))}
    />
  );
}

const pillStyles: Record<SyncStatus, { cls: string; label: string }> = {
  pending: { cls: 'bg-amber-100 text-amber-900', label: 'Queued' },
  synced: { cls: 'bg-emerald-100 text-emerald-900', label: 'Synced' },
  failed: { cls: 'bg-red-100 text-red-900', label: 'Needs attention' },
};

export function StatusPill({ status }: { status: SyncStatus }) {
  const s = pillStyles[status];
  return (
    <span data-testid="status-pill" data-status={status} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}
