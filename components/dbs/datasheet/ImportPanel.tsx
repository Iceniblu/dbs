"use client";

import { useEffect, useRef, useState } from "react";
import { blobToBase64, BOOKMARKLET, parseCopiedPage, type ImportInput } from "@/lib/datasheet-client";

const MAX_FILE = 3_000_000;
const MAX_REQUEST = 4_200_000; // Vercel caps request bodies at ~4.5 MB

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// The import form: a product link, an uploaded PDF/picture and/or pasted text, plus optional hints.
// Any combination can be used; more sources are cross-checked in the same import for more confidence.
export default function ImportPanel({ busy, error, onImport }: { busy: boolean; error: string | null; onImport: (input: ImportInput, hints: string) => void }) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [text, setText] = useState("");
  const [hints, setHints] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [page, setPage] = useState<{ url: string; html: string } | null>(null); // from the Copy for DBS bookmark

  // React refuses javascript: links, so the bookmark's address is set on the element directly.
  const bookmark = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    bookmark.current?.setAttribute("href", BOOKMARKLET);
  }, []);

  // Pasting a page copied with the bookmark (anywhere in this box) attaches it instead of filling a field.
  function onPaste(e: React.ClipboardEvent) {
    const copied = parseCopiedPage(e.clipboardData.getData("text/plain"));
    if (!copied) return;
    e.preventDefault();
    setProblem(null);
    setPage(copied);
    if (host(url) === host(copied.url)) setUrl(""); // the copy replaces fetching the same site
  }

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
      if (page) {
        input.page_html = page.html;
        input.page_url = page.url;
      }
      if (!input.url && !input.file && !input.text && !page) throw new Error("Add a link, a file or some pasted text (or several).");
      if ((input.page_html?.length ?? 0) + (input.file?.length ?? 0) + (input.text?.length ?? 0) > MAX_REQUEST) {
        throw new Error("That's too much to send in one go. Remove the file or the copied page and try again.");
      }
      onImport(input, hints);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't start the import.");
    }
  }

  const count = [url.trim(), file, text.trim(), page].filter(Boolean).length;

  return (
    <form className="ds-panel" onSubmit={submit} onPaste={onPaste}>
      <h2 className="dbs-h">Import</h2>
      <p className="dbs-muted ds-note">Use one source or several: they&rsquo;re read together and checked against each other.</p>
      <label className="ds-field">
        <span>Product page or PDF datasheet link</span>
        <input type="url" placeholder="https://www.mlplight.com/smart-lotis#smart-lotis-115" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      {page && (
        <div className="ds-copied">
          <span>
            <b>Page copied from {host(page.url)}</b> ({Math.round(page.html.length / 1024)} KB). It will be read like a link.
          </span>
          <button type="button" className="ghost ds-small" onClick={() => setPage(null)}>Remove</button>
        </div>
      )}
      <details className="ds-bookmark">
        <summary>Site blocks the import (error 429 or 403)? Copy the page from your browser</summary>
        <ol>
          <li>
            Drag this button to your browser&rsquo;s bookmarks bar (once):{" "}
            <a ref={bookmark} className="ds-bookmarklet" onClick={(e) => e.preventDefault()} title="Drag me to the bookmarks bar">Copy for DBS</a>
          </li>
          <li>Open the product page in your browser and click the <b>Copy for DBS</b> bookmark. It copies the page as you see it.</li>
          <li>Come back here, click in this Import box and paste (Ctrl+V).</li>
        </ol>
        <p className="dbs-muted ds-note">Pictures on a blocked site may not load either: paste or upload those into the picture boxes.</p>
      </details>
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
