"use client";

import { useState } from "react";
import { blobToBase64, type ImportInput } from "@/lib/datasheet-client";

type Mode = "link" | "file" | "text";
const MAX_FILE = 3_000_000;

// The import form: a product link, an uploaded PDF/picture, or pasted text, plus optional hints.
export default function ImportPanel({ busy, error, onImport }: { busy: boolean; error: string | null; onImport: (input: ImportInput, hints: string) => void }) {
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [hints, setHints] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    try {
      if (mode === "link") {
        const u = url.trim();
        if (!/^https?:\/\//i.test(u)) throw new Error("Paste a full link starting with https://");
        onImport(/\.pdf(\?|#|$)/i.test(u) ? { pdf_url: u } : { url: u }, hints);
      } else if (mode === "file") {
        if (!file) throw new Error("Choose a PDF or picture first.");
        if (file.size > MAX_FILE) throw new Error("That file is over 3 MB. Use its link instead, or paste the key text.");
        onImport({ file: await blobToBase64(file), media_type: file.type || "application/pdf", name: file.name }, hints);
      } else {
        if (text.trim().length < 20) throw new Error("Paste the product's specification text first.");
        onImport({ text }, hints);
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't start the import.");
    }
  }

  return (
    <form className="ds-panel" onSubmit={submit}>
      <h2 className="dbs-h">Import</h2>
      <div className="ds-tabs" role="tablist" aria-label="Import from">
        {([["link", "Link"], ["file", "Upload"], ["text", "Paste text"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? "ds-tab on" : "ds-tab"} onClick={() => setMode(k)}>
            {label}
          </button>
        ))}
      </div>
      {mode === "link" && (
        <label className="ds-field">
          <span>Product page or PDF datasheet link</span>
          <input type="url" placeholder="https://www.mlplight.com/smart-lotis#smart-lotis-115" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      )}
      {mode === "file" && (
        <label className="ds-field">
          <span>PDF datasheet or picture (up to 3 MB)</span>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      )}
      {mode === "text" && (
        <label className="ds-field">
          <span>Specification text copied from the product page</span>
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the product name, specifications, dimensions…" />
        </label>
      )}
      <label className="ds-field">
        <span>Options to pick (optional)</span>
        <input type="text" placeholder="e.g. 115 size, 4000K, 500mA, white, DALI" value={hints} onChange={(e) => setHints(e.target.value)} />
      </label>
      <div className="row">
        <button type="submit" disabled={busy}>{busy ? "Reading…" : "Import"}</button>
      </div>
      {busy && <p className="dbs-muted">Reading the product details. This can take up to a minute.</p>}
      {(problem || error) && <p className="error">{problem || error}</p>}
      <p className="dbs-muted ds-note">Import fills the fields as a best effort. Check everything before issuing.</p>
    </form>
  );
}
