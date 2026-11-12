"use client";

import { useState } from "react";
import { blobToBase64, type ImportInput } from "@/lib/datasheet-client";

const MAX_FILE = 3_000_000;

// The import form: a product link, an uploaded PDF/picture and/or pasted text, plus optional hints.
// Any combination can be used; more sources are cross-checked in the same import for more confidence.
export default function ImportPanel({ busy, error, onImport }: { busy: boolean; error: string | null; onImport: (input: ImportInput, hints: string) => void }) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [text, setText] = useState("");
  const [hints, setHints] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    try {
      const input: ImportInput = {};
      const u = url.trim();
      if (u) {
        if (!/^https?:\/\//i.test(u)) throw new Error("Paste a full link starting with https://");
        input.url = u;
      }
      if (file) {
        if (file.size > MAX_FILE) throw new Error("That file is over 3 MB. Use its link instead, or paste the key text.");
        input.file = await blobToBase64(file);
        input.media_type = file.type || "application/pdf";
        input.name = file.name;
      }
      if (text.trim()) {
        if (text.trim().length < 20) throw new Error("The pasted text is very short. Paste the product's specification text.");
        input.text = text;
      }
      if (!input.url && !input.file && !input.text) throw new Error("Add a link, a file or some pasted text (or several).");
      onImport(input, hints);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't start the import.");
    }
  }

  const count = [url.trim(), file, text.trim()].filter(Boolean).length;

  return (
    <form className="ds-panel" onSubmit={submit}>
      <h2 className="dbs-h">Import</h2>
      <p className="dbs-muted ds-note">Use one source or several: they&rsquo;re read together and checked against each other.</p>
      <label className="ds-field">
        <span>Product page or PDF datasheet link</span>
        <input type="url" placeholder="https://www.mlplight.com/smart-lotis#smart-lotis-115" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <div className="ds-field">
        <span>PDF datasheet or picture (up to 3 MB)</span>
        <div className="ds-file">
          <input key={fileKey} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="PDF datasheet or picture" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && <button type="button" className="ghost ds-small" onClick={() => { setFile(null); setFileKey((k) => k + 1); }}>Clear</button>}
        </div>
      </div>
      <label className="ds-field">
        <span>Specification text copied from the product page</span>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the product name, specifications, dimensions…" />
      </label>
      <label className="ds-field">
        <span>Options to pick (optional)</span>
        <input type="text" placeholder="e.g. 115 size, 4000K, 500mA, white, DALI" value={hints} onChange={(e) => setHints(e.target.value)} />
      </label>
      <div className="row" style={{ alignItems: "center" }}>
        <button type="submit" disabled={busy}>{busy ? "Reading…" : count > 1 ? `Import from ${count} sources` : "Import"}</button>
      </div>
      {busy && <p className="dbs-muted">Reading the product details. This can take up to a minute.</p>}
      {(problem || error) && <p className="error">{problem || error}</p>}
      <p className="dbs-muted ds-note">Import fills the fields as a best effort. Check everything before issuing.</p>
    </form>
  );
}
