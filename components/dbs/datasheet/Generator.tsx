"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DbsShell from "@/components/dbs/Shell";
import BrandForm from "@/components/dbs/suppliers/BrandForm";
import CheckField from "@/components/dbs/datasheet/CheckField";
import ImportPanel from "@/components/dbs/datasheet/ImportPanel";
import PictureSlot from "@/components/dbs/datasheet/PictureSlot";
import Preview from "@/components/dbs/datasheet/Preview";
import {
  applyExtracted, blankSheet, fileName, finishText, lumensFor, newId, SPEC_FIELDS, uncheckedCount,
  type Extra, type ImportResult, type Picture, type Sheet, type SpecKey, type TextKey,
} from "@/lib/datasheet";
import { clearDraft, loadDraft, loadFooter, pictureFromUrl, runImport, saveDraft, type ImportInput } from "@/lib/datasheet-client";
import { contactFor, loadDirectory, matchBrand, supplierLines, type Directory } from "@/lib/dbs-suppliers";

// The DBS datasheet generator: import, check, edit, preview and download as .docx. Page: app/datasheet/page.tsx.

// Once connected load and colour temperature are known, fill delivered lumens from the manufacturer's
// table (still to be checked), unless it has been typed or ticked by hand.
function withLumens(s: Sheet): Sheet {
  const l = lumensFor(s);
  const cur = s.specs.lumens;
  if (!l || (cur.value.trim() && !cur.unchecked) || cur.value.trim() === l) return s;
  return { ...s, specs: { ...s.specs, lumens: { value: l, unchecked: true } } };
}

// Quick-select mounting for Description line 1, and the matching driver line (remote if recessed).
const MOUNTINGS = [
  { key: "Surface", text: "Surface mounted", remote: false },
  { key: "Rod", text: "Rod suspended", remote: false },
  { key: "Wire", text: "Wire suspended", remote: false },
  { key: "Ceiling", text: "Ceiling recessed", remote: true },
  { key: "Grid", text: "Grid ceiling recessed", remote: true },
] as const;
const MOUNTING_START = /^(grid ceiling recessed|ceiling recessed|surface mounted|rod suspended|wire suspended|track mounted|wall mounted|suspended|recessed|surface)\s*/i;
const DRIVER_LINE = /^supplied with (remote|integral) dali driver\.?$/i;

function withMounting(description: string, m: (typeof MOUNTINGS)[number]): string {
  const lines = description.split("\n");
  const rest = (lines[0] ?? "").trim().replace(MOUNTING_START, "");
  lines[0] = `${m.text} ${rest}`.trimEnd() + (rest ? "" : " ");
  const driver = `Supplied with ${m.remote ? "remote" : "integral"} DALI driver`;
  if (lines.length < 2 || !lines[1].trim()) lines[1] = driver;
  else if (DRIVER_LINE.test(lines[1].trim())) lines[1] = driver;
  return lines.join("\n");
}

// Standard notes that can be added with one click.
const TRACK_NOTE = "Track supplied with all required mounting accessories to suit arrangement shown on drawings.";

function Chips({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  const cur = value.trim().toLowerCase();
  return (
    <div className="ds-chips" role="group" aria-label="Options">
      {options.map((o) => (
        <button key={o} type="button" className={cur === o.toLowerCase() || cur.startsWith(`${o.toLowerCase()},`) ? "ds-chip on" : "ds-chip"} onClick={() => onPick(o)}>{o}</button>
      ))}
    </div>
  );
}
export default function Generator({ email }: { email?: string }) {
  const [sheet, setSheet] = useState<Sheet>(blankSheet);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<(ImportResult & { model: string }) | null>(null);
  const [lastHints, setLastHints] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [picNote, setPicNote] = useState<string | null>(null);
  const [dir, setDir] = useState<Directory | null>(null);
  const [dirError, setDirError] = useState(false);
  const [addingBrand, setAddingBrand] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false); // "Other specifications" starts collapsed

  // Restore this browser's draft (and the last document reference) once.
  useEffect(() => {
    const draft = loadDraft();
    const footer = loadFooter();
    setSheet((s) => draft ?? (footer ? { ...s, ...footer } : s));
    setLoaded(true);
  }, []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveDraft(sheet), 400);
  }, [sheet, loaded]);

  // The supplier list, reloaded when coming back to this tab.
  const refreshDir = useCallback(() => {
    loadDirectory().then((d) => { setDir(d); setDirError(false); }, () => setDirError(true));
  }, []);
  useEffect(() => {
    refreshDir();
    const onShow = () => document.visibilityState === "visible" && refreshDir();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", refreshDir);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", refreshDir);
    };
  }, [refreshDir]);

  const brandMatch = dir && sheet.brand.trim() ? matchBrand(sheet.brand, dir.brands) : null;
  const brandText = brandMatch && dir ? supplierLines(brandMatch, dir) : "";

  // When the brand is in the supplier list, Supplier comes from there (and needs no checking),
  // unless it has been typed over by hand.
  useEffect(() => {
    if (!loaded || !brandText) return;
    setSheet((s) => {
      const cur = s.supplier.value.trim();
      const replace = !cur || s.supplier.unchecked || cur.toLowerCase() === s.brand.trim().toLowerCase();
      return replace && cur !== brandText ? { ...s, supplier: { value: brandText } } : s;
    });
  }, [brandText, loaded]);

  const setText = (k: TextKey, value: string) => setSheet((s) => ({ ...s, [k]: { value } }));
  const checkText = (k: TextKey) => setSheet((s) => ({ ...s, [k]: { value: s[k].value } }));
  const setSpec = (k: SpecKey, value: string) => setSheet((s) => withLumens({ ...s, specs: { ...s.specs, [k]: { value } } }));
  const checkSpec = (k: SpecKey) => setSheet((s) => ({ ...s, specs: { ...s.specs, [k]: { value: s.specs[k].value } } }));
  const setExtra = (id: string, patch: Partial<Extra>) => setSheet((s) => ({ ...s, extras: s.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const removeExtra = (id: string) => setSheet((s) => ({ ...s, extras: s.extras.filter((e) => e.id !== id) }));

  function chooseBrand(name: string) {
    setAddingBrand(false);
    setSheet((s) => ({ ...s, brand: name }));
  }

  async function doImport(input: ImportInput, hints: string) {
    setBusy(true);
    setImportError(null);
    setLastHints(hints);
    setAddingBrand(false);
    try {
      const r = await runImport(input, hints);
      setResult(r);
      const x = r.extracted;
      const m = dir && x.brand ? matchBrand(x.brand, dir.brands) : null;
      setSheet((s) => {
        const next = applyExtracted(s, x, m && dir ? { text: supplierLines(m, dir), fromList: true } : { text: x.brand, fromList: false });
        return withLumens({ ...next, brand: m ? m.name : x.brand, product: null, drawing: null });
      });
      if (x.brand && dir && !m) setAddingBrand(true); // prompt to add the brand
      // Pull in the pictures the import picked. Ones it can't find stay empty (and highlighted).
      const picks: ["product" | "drawing", string][] = [["product", x.product_image], ["drawing", x.drawing_image]];
      const missing: string[] = [];
      await Promise.all(
        picks.map(async ([slot, u]) => {
          const what = slot === "product" ? "product photo" : "dimension drawing";
          if (!u) return void missing.push(what);
          try {
            const pic = await pictureFromUrl(u);
            setSheet((s) => ({ ...s, [slot]: { ...pic, unchecked: true } }));
          } catch {
            missing.push(what);
          }
        })
      );
      setPicNote(missing.length ? `No ${missing.join(" or ")} found. Pick one below, or upload, paste or link one.` : null);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function usePicture(slot: "product" | "drawing", url: string) {
    setPicNote(null);
    try {
      const pic: Picture = await pictureFromUrl(url);
      setSheet((s) => ({ ...s, [slot]: pic }));
    } catch (e) {
      setPicNote(e instanceof Error ? e.message : "Couldn't load that picture.");
    }
  }

  const toCheck = uncheckedCount(sheet);

  async function download() {
    const missingPics = [sheet.product, sheet.drawing].filter((p) => !p).length;
    const issues = [toCheck ? `${toCheck} item${toCheck === 1 ? "" : "s"} not checked yet` : "", missingPics ? `${missingPics} picture${missingPics === 1 ? "" : "s"} missing` : ""].filter(Boolean);
    if (issues.length && !confirm(`${issues.join(" and ")}. Download anyway?`)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { buildDocx } = await import("@/lib/datasheet-docx");
      const blob = await buildDocx(sheet);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName(sheet);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't make the Word file.");
    } finally {
      setSaving(false);
    }
  }

  function startOver() {
    if (!confirm("Clear this datasheet and start a new one?")) return;
    clearDraft();
    setResult(null);
    setPicNote(null);
    setAddingBrand(false);
    setSheet({ ...blankSheet(), docRef: sheet.docRef, copyright: sheet.copyright });
  }

  const contact = brandMatch && dir ? contactFor(brandMatch, dir, true) : null;

  // Project info and the main actions, on the right of the navy band.
  const projectPanel = (
    <div className="ds-project">
      <span className="ds-project-h">Project</span>
      <label className="ds-field">
        <span>Document reference</span>
        <input type="text" placeholder="26019-SPE-E-02 [B] Electrical Schedules" value={sheet.docRef} onChange={(e) => setSheet((s) => ({ ...s, docRef: e.target.value }))} />
      </label>
      <label className="ds-field">
        <span>Copyright line</span>
        <input type="text" value={sheet.copyright} onChange={(e) => setSheet((s) => ({ ...s, copyright: e.target.value }))} />
      </label>
      <div className="ds-actions">
        <button type="button" onClick={download} disabled={saving}>{saving ? "Making file…" : "Download Word (.docx)"}</button>
        <button type="button" className="ghost" onClick={startOver}>Start new</button>
        {toCheck > 0 && <span className="ds-project-check">{toCheck} to check</span>}
      </div>
      {saveError && <p className="error">{saveError}</p>}
    </div>
  );

  return (
    <DbsShell title="Datasheet generator" subtitle="Turn a product page, PDF or pasted specs into a DBS datasheet in Word." email={email} back={{ href: "/", label: "All tools" }} aside={projectPanel}>
      <div className="ds-layout">
        <div className="ds-form">
          <section className="ds-panel ds-type">
            <CheckField label="Type" field={sheet.type} placeholder="D4" onChange={(v) => setText("type", v)} onCheck={() => checkText("type")} />
            <p className="dbs-muted ds-note">The fitting&rsquo;s schedule type, as on the drawings (e.g. D4, L1, EX2).</p>
          </section>

          <ImportPanel busy={busy} error={importError} onImport={doImport} />

          {result && (
            <section className="ds-panel ds-result">
              <p className="dbs-muted">
                Imported from <span className="ds-src">{result.source}</span>
                {result.extracted.variant && <> · Variant: <b>{result.extracted.variant}</b></>}
              </p>
              {toCheck > 0 && <p className="ds-red ds-small-text">Everything imported is shown in red until you tick it as checked.</p>}
              {result.extracted.warnings.length > 0 && (
                <ul className="ds-warn">
                  {result.extracted.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              {picNote && <p className="error">{picNote}</p>}
              {result.pdfs.length > 0 && (
                <div className="ds-pdfs">
                  <span className="ds-label">Datasheets on that page</span>
                  {result.pdfs.slice(0, 8).map((p) => (
                    <div key={p.url} className="ds-pdf">
                      <a href={p.url} target="_blank" rel="noreferrer">{p.text}</a>
                      <button type="button" className="ghost ds-small" disabled={busy} onClick={() => doImport({ pdf_url: p.url }, lastHints)}>Read this PDF</button>
                    </div>
                  ))}
                </div>
              )}
              {result.images.length > 0 && (
                <details className="ds-gallery" open={!sheet.product || !sheet.drawing}>
                  <summary>Pictures on that page ({result.images.length})</summary>
                  <div className="ds-thumbs">
                    {result.images.slice(0, 40).map((im) => (
                      <figure key={im.url}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.url} alt={im.alt} loading="lazy" referrerPolicy="no-referrer" />
                        <div className="ds-thumb-actions">
                          <button type="button" className="ghost ds-small" onClick={() => usePicture("product", im.url)}>Photo</button>
                          <button type="button" className="ghost ds-small" onClick={() => usePicture("drawing", im.url)}>Drawing</button>
                        </div>
                      </figure>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          <section className="ds-panel">
            <h2 className="dbs-h">Datasheet</h2>

            <CheckField label="Designation" field={sheet.title} placeholder="RECESSED FIXED DOWNLIGHT" onChange={(v) => setText("title", v)} onCheck={() => checkText("title")} />

            <div className="ds-pics">
              <PictureSlot label="Product photo" value={sheet.product} onChange={(p) => setSheet((s) => ({ ...s, product: p }))} />
              <PictureSlot label="Dimension drawing" value={sheet.drawing} onChange={(p) => setSheet((s) => ({ ...s, drawing: p }))} />
            </div>

            <CheckField
              label="Description"
              quick={MOUNTINGS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={sheet.description.value.trim().toLowerCase().startsWith(m.text.toLowerCase() + " ") || sheet.description.value.trim().toLowerCase() === m.text.toLowerCase() ? "ds-chip on" : "ds-chip"}
                  title={`Start with "${m.text}"`}
                  onClick={() => setText("description", withMounting(sheet.description.value, m))}
                >
                  {m.key}
                </button>
              ))}
              multiline
              field={sheet.description} placeholder={"Ceiling recessed LED directional downlight\nSupplied with remote DALI driver"} onChange={(v) => setText("description", v)} onCheck={() => checkText("description")} />

            <label className="ds-field">
              <span>Brand</span>
              <input type="text" list="ds-brands" placeholder="Modular" value={sheet.brand} onChange={(e) => chooseBrand(e.target.value)} />
              <datalist id="ds-brands">
                {dir?.brands.map((b) => <option key={b.id} value={b.name} />)}
              </datalist>
            </label>
            {sheet.brand.trim() && !addingBrand && (
              <div className="ds-brand">
                {brandMatch && contact ? (
                  <>
                    <span>
                      In the supplier list: <b>{contact.supplier?.name ?? "no supplier linked"}</b>
                      {contact.person ? <> · {contact.person.name}{contact.person.phone ? ` · ${contact.person.phone}` : ""}</> : contact.supplier ? <> · no contact yet</> : null}
                    </span>
                    {sheet.supplier.value.trim() !== brandText && (
                      <button type="button" className="ghost ds-small" onClick={() => setSheet((s) => ({ ...s, supplier: { value: brandText } }))}>Use supplier list</button>
                    )}
                    <a href="/suppliers">Edit list</a>
                  </>
                ) : dirError ? (
                  <span className="dbs-muted">The supplier list couldn&rsquo;t be loaded.</span>
                ) : dir ? (
                  <>
                    <span className="ds-red">&ldquo;{sheet.brand.trim()}&rdquo; isn&rsquo;t in the supplier list yet.</span>
                    <button type="button" className="ghost ds-small" onClick={() => setAddingBrand(true)}>Add brand…</button>
                  </>
                ) : null}
              </div>
            )}
            {addingBrand && dir && (
              <div className="ds-addbrand">
                <p className="ds-red ds-small-text">&ldquo;{sheet.brand.trim()}&rdquo; isn&rsquo;t in the supplier list. Add it with its supplier and contact so the Supplier cell fills in.</p>
                <BrandForm
                  dir={dir}
                  brand={null}
                  initialName={sheet.brand.trim()}
                  onRefresh={refreshDir}
                  onDone={(saved) => {
                    setAddingBrand(false);
                    if (saved) refreshDir();
                  }}
                />
              </div>
            )}

            <CheckField
              label="Supplier"
              multiline
              field={sheet.supplier}
              placeholder={"Brand\nContact Name @ Supplier: Mobile"}
              onChange={(v) => setText("supplier", v)}
              onCheck={() => checkText("supplier")}
              note={brandMatch && sheet.supplier.value.trim() === brandText ? <small className="ds-from">From the supplier list</small> : null}
            />
            <CheckField label="Code" field={sheet.code} placeholder="Smart Lotis 500mA" onChange={(v) => setText("code", v)} onCheck={() => checkText("code")} />

            <fieldset className="ds-specs">
              <legend className="ds-label">Specifications</legend>
              <p className="dbs-muted ds-note">Leave a line empty if it doesn&rsquo;t apply (e.g. tilt on a fixed downlight); it is left off the sheet. Colour temperature prints in bold. Where the product comes in several versions, pick one from the options; delivered lumens then fill in from the manufacturer&rsquo;s table.</p>
              <div className="ds-spec-grid">
                {SPEC_FIELDS.map((f) => (
                  <CheckField
                    key={f.key}
                    compact
                    label={f.label}
                    field={sheet.specs[f.key]}
                    placeholder={f.example}
                    onChange={(v) => setSpec(f.key, v)}
                    onCheck={() => checkSpec(f.key)}
                    choose={(sheet.options[f.key]?.length ?? 0) > 1}
                    note={(sheet.options[f.key]?.length ?? 0) > 1 ? <Chips options={sheet.options[f.key]!} value={sheet.specs[f.key].value} onPick={(v) => setSpec(f.key, v)} /> : null}
                  />
                ))}
              </div>
              <details className="ds-extras" open={extrasOpen} onToggle={(e) => setExtrasOpen((e.currentTarget as HTMLDetailsElement).open)}>
                <summary>
                  Other specifications{sheet.extras.length > 0 && <> ({sheet.extras.length}{sheet.extras.some((x) => x.suggested) ? `, ${sheet.extras.filter((x) => x.suggested).length} suggested` : ""})</>}
                </summary>
                {sheet.extras.map((e) => (
                  <div key={e.id} className={`ds-extra${e.suggested ? " suggested" : ""}`}>
                    <input type="text" aria-label="Specification name" placeholder="Name" value={e.label} onChange={(ev) => setExtra(e.id, { label: ev.target.value })} />
                    <input type="text" aria-label="Specification value" placeholder="Value" value={e.value} onChange={(ev) => setExtra(e.id, { value: ev.target.value })} />
                    {e.suggested && <button type="button" className="ds-tick" onClick={() => setExtra(e.id, { suggested: false })} title="Add to the datasheet">✓ Add</button>}
                    <button type="button" className="ghost ds-icon" aria-label={`Remove ${e.label || "specification"}`} onClick={() => removeExtra(e.id)}>✕</button>
                  </div>
                ))}
                {sheet.extras.some((e) => e.suggested) && <p className="dbs-muted ds-note">Suggested lines (dark red) only go on the sheet once you tick ✓ Add.</p>}
                <div className="row">
                  <button type="button" className="ghost ds-small" onClick={() => setSheet((s) => ({ ...s, extras: [...s.extras, { id: newId(), label: "", value: "" }] }))}>+ Add specification</button>
                </div>
              </details>
            </fieldset>

            <CheckField label="Dimensions" field={sheet.dimensions} placeholder="300 x 1200 x 70 H" onChange={(v) => setText("dimensions", v)} onCheck={() => checkText("dimensions")} />
            <CheckField
              label="Finish"
              field={sheet.finish}
              placeholder="White, to be confirmed by architect"
              onChange={(v) => setText("finish", v)}
              onCheck={() => checkText("finish")}
              note={sheet.finishOptions.length > 1 ? <Chips options={sheet.finishOptions} value={sheet.finish.value} onPick={(v) => setText("finish", finishText(v))} /> : null}
            />
            <CheckField
              label="Notes"
              quick={
                <button
                  type="button"
                  className={sheet.notes.value.includes(TRACK_NOTE) ? "ds-chip on" : "ds-chip"}
                  title={TRACK_NOTE}
                  onClick={() => !sheet.notes.value.includes(TRACK_NOTE) && setText("notes", [sheet.notes.value.trim(), TRACK_NOTE].filter(Boolean).join("\n"))}
                >
                  Track accessories
                </button>
              }
              multiline
              field={sheet.notes} onChange={(v) => setText("notes", v)} onCheck={() => checkText("notes")} />
          </section>

          <p className="dbs-muted ds-note">Your draft is kept in this browser until you start a new one. Red is only shown on screen; the Word file prints normally.</p>
        </div>

        <aside className="ds-preview">
          <span className="ds-label">Preview</span>
          <Preview sheet={sheet} />
        </aside>
      </div>
    </DbsShell>
  );
}
