import { useState, type CSSProperties, type KeyboardEvent } from 'react';

export interface NumericInputProps {
  value: number;
  onCommit: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  fallback?: number;
  integer?: boolean;
  decimals?: number;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
}

function normalizeNumber(n: number, min?: number, max?: number, integer?: boolean, decimals?: number): number {
  let res = n;
  if (min !== undefined) res = Math.max(min, res);
  if (max !== undefined) res = Math.min(max, res);
  if (integer) return Math.round(res);
  if (decimals !== undefined) return Number(res.toFixed(decimals));
  return res;
}

/** Controlled numeric input that preserves intermediate text while typing and commits/clamps on blur or Enter. */
export function NumericInput({
  value,
  onCommit,
  min,
  max,
  step,
  fallback,
  integer,
  decimals,
  className,
  style,
  disabled,
  ariaLabel,
  title,
}: NumericInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const handleFocus = () => {
    setFocused(true);
    setDraft(String(value));
  };

  const handleChange = (raw: string) => {
    setDraft(raw);
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    if (min !== undefined && parsed < min) return;
    if (max !== undefined && parsed > max) return;
    const normalized = normalizeNumber(parsed, min, max, integer, decimals);
    if (normalized !== value) {
      onCommit(normalized);
    }
  };

  const handleBlur = () => {
    const trimmed = draft.trim();
    const parsed = trimmed === '' ? Number.NaN : Number(trimmed);
    const base = Number.isFinite(parsed) ? parsed : (fallback ?? value);
    const finalVal = normalizeNumber(base, min, max, integer, decimals);
    if (finalVal !== value) {
      onCommit(finalVal);
    }
    setFocused(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setDraft(String(value));
      setFocused(false);
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      className={className}
      style={style}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      value={focused ? draft : String(value)}
      onFocus={handleFocus}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
