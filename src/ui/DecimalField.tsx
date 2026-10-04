import { useState } from 'react';
import { formatNumber, parseDecimal } from '../model/text';

/**
 * Champ numérique à la française (« 2,5 » comme « 2.5 »). Un champ type="number" de Safari
 * renvoie une valeur vide pour « 2,5 » et la saisie serait perdue sans prévenir.
 * Hors saisie, il affiche toujours la valeur du projet (annulation, poignée de rotation…).
 */
export function DecimalField({
  label,
  value,
  onChange,
  min,
  max,
  required,
  unit,
  width,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  required?: boolean;
  unit?: string;
  width?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const shown = draft ?? (value === null ? '' : formatNumber(value));
  return (
    <span className="decimal-field" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input
        aria-label={label}
        aria-invalid={err}
        inputMode="decimal"
        value={shown}
        style={{ ...(width ? { width } : {}), ...(err ? { borderColor: 'var(--danger)' } : {}) }}
        title={`Entre ${formatNumber(min)} et ${formatNumber(max)}`}
        onFocus={(e) => {
          setDraft(e.target.value);
          e.target.select();
        }}
        onBlur={() => {
          setDraft(null);
          setErr(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(null);
            setErr(false);
          }
        }}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          if (!t.trim()) {
            setErr(!!required);
            if (!required) onChange(null);
            return;
          }
          const v = parseDecimal(t);
          const ok = v !== null && v >= min && v <= max;
          setErr(!ok);
          if (ok) onChange(v);
        }}
      />
      {unit && <span className="note">{unit}</span>}
    </span>
  );
}
