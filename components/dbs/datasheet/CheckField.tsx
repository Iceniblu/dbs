"use client";

import type { Field } from "@/lib/datasheet";

// A datasheet value with its "needs checking" state: red until ticked or edited.
export default function CheckField({
  label, field, onChange, onCheck, multiline = false, placeholder, note, className, compact = false, choose = false,
}: {
  label: string;
  field: Field;
  onChange: (value: string) => void;
  onCheck: () => void;
  multiline?: boolean;
  placeholder?: string;
  note?: React.ReactNode;
  className?: string;
  compact?: boolean; // small ✓ button, for the specifications grid
  choose?: boolean;  // several options offered and none picked yet
}) {
  const red = !!field.unchecked && !!field.value.trim();
  const cls = red ? "unchecked" : choose && !field.value.trim() ? "choose" : undefined;
  return (
    <div className={`ds-field ds-check${className ? ` ${className}` : ""}`}>
      <div className="ds-check-head">
        <span>{label}</span>
        {red && <button type="button" className="ds-tick" onClick={onCheck} title="Mark as checked" aria-label={`Mark ${label} as checked`}>{compact ? "✓" : "✓ Checked"}</button>}
      </div>
      {multiline ? (
        <textarea className={cls} aria-label={label} value={field.value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" className={cls} aria-label={label} value={field.value} placeholder={choose && !field.value.trim() ? "Choose below" : placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {note}
    </div>
  );
}
