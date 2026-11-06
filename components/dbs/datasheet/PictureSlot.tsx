"use client";

import { useState } from "react";
import type { Picture } from "@/lib/datasheet";
import { pictureFromUrl, toPicture } from "@/lib/datasheet-client";

// One picture on the datasheet (product photo or dimension drawing): upload, paste, or load from a link.
// A missing picture is highlighted (the .docx gets a "REQUIRED" placeholder); an imported one needs a tick.
export default function PictureSlot({ label, value, onChange }: { label: string; value: Picture | null; onChange: (p: Picture | null) => void }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function take(work: () => Promise<Picture>) {
    setBusy(true);
    setError(null);
    try {
      onChange(await work());
      setLink("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't use that picture.");
    } finally {
      setBusy(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const blob = item?.getAsFile();
    if (blob) {
      e.preventDefault();
      void take(() => toPicture(blob, "Pasted"));
    }
  }

  return (
    <div className="ds-pic" onPaste={onPaste}>
      <div className="ds-pic-head">
        <span className="ds-label">{label}</span>
        <div className="row">
          {value?.unchecked && <button type="button" className="ds-tick" onClick={() => onChange({ ...value, unchecked: false })} title="Mark as checked">✓ Checked</button>}
          {value && <button type="button" className="ghost ds-small" onClick={() => onChange(null)}>Remove</button>}
        </div>
      </div>
      <div className={`ds-pic-box${value ? (value.unchecked ? " unchecked" : "") : " missing"}`} tabIndex={0} aria-label={`${label}: click here and paste a picture`}>
        {value ? (
          <img src={value.dataUrl} alt={label} />
        ) : (
          <span>{busy ? "Loading…" : <><b>{label} required</b><br />Upload, paste (Ctrl+V) or link a picture</>}</span>
        )}
      </div>
      <div className="ds-pic-actions">
        <label className="ds-upload">
          Upload
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(() => toPicture(f, f.name)); e.target.value = ""; }} />
        </label>
        <input type="url" placeholder="or picture link" value={link} onChange={(e) => setLink(e.target.value)} />
        <button type="button" className="ghost ds-small" disabled={busy || !link.trim()} onClick={() => take(() => pictureFromUrl(link.trim()))}>Load</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
