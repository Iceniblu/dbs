// Datasheet generator (DBS): shared types and helpers for the page, the import route and the .docx builder.
// A datasheet has a fixed layout, like the DBS electrical schedules:
//   pictures (product photo, dimension drawing) / designation "D4 - RECESSED FIXED DOWNLIGHT" /
//   Description / Supplier / Code / Specifications (fixed list + accepted extras) / Dimensions / Finish / Notes.
// Every value remembers whether it still needs checking ("unchecked"): anything the import fills starts
// unchecked (shown red on screen with a tick); typing in it or ticking it marks it checked.
// Values are multi-line; **text** marks bold.

export type Field = { value: string; unchecked?: boolean };
export type Picture = { dataUrl: string; width: number; height: number; source?: string; unchecked?: boolean };
export type Extra = { id: string; label: string; value: string; suggested?: boolean }; // suggested = from import, not yet accepted

export const SPEC_FIELDS = [
  { key: "ip", label: "IP rating", example: "IP20" },
  { key: "beam", label: "Beam angle", example: "40 degree" },
  { key: "tilt", label: "Tilt", example: "30 degree" },
  { key: "cri", label: "CRI", example: "90" },
  { key: "cct", label: "Colour temperature", example: "3000K", bold: true },
  { key: "lumens", label: "Delivered lumens", example: "1000 lm (linear: lm/m)" },
  { key: "load", label: "Connected load", example: "20W" },
] as const;
export type SpecKey = (typeof SPEC_FIELDS)[number]["key"];

export const TEXT_FIELDS = ["type", "title", "description", "supplier", "code", "dimensions", "finish", "notes"] as const;
export type TextKey = (typeof TEXT_FIELDS)[number];

export type Sheet = {
  v: 2;
  type: Field;          // "D4"
  title: Field;         // "RECESSED FIXED DOWNLIGHT"
  brand: string;        // "Modular": looked up in the supplier database to fill Supplier
  description: Field;
  supplier: Field;      // "Modular\nContact Ben Moth @ Modular Partners: 0414 191 288"
  code: Field;
  specs: Record<SpecKey, Field>;
  extras: Extra[];
  dimensions: Field;
  finish: Field;
  notes: Field;
  product: Picture | null;
  drawing: Picture | null;
  docRef: string;       // footer line 1, e.g. "26019-SPE-E-02 [B] Electrical Schedules"
  copyright: string;    // footer line 2
  // From the import: the choices the manufacturer offers, shown as chips to pick from.
  options: Partial<Record<SpecKey, string[]>>;
  finishOptions: string[];
  lumenTable: LumenRow[]; // delivered lumens by connected load and colour temperature
};

export type LumenRow = { load: string; cct: string; lumens: string }; // "13W", "3000K", "1190 lm"

let seq = 0;
export const newId = () => `x${Date.now().toString(36)}${(seq++).toString(36)}`;

const empty = (): Field => ({ value: "" });
const blankSpecs = () => Object.fromEntries(SPEC_FIELDS.map((f) => [f.key, empty()])) as Record<SpecKey, Field>;

export function blankSheet(): Sheet {
  return {
    v: 2,
    type: empty(), title: empty(), brand: "",
    description: empty(), supplier: empty(), code: empty(),
    specs: blankSpecs(), extras: [],
    dimensions: empty(), finish: empty(), notes: empty(),
    product: null, drawing: null,
    docRef: "",
    copyright: `Copyright ${new Date().getFullYear()} DBS Consulting`,
    options: {}, finishOptions: [], lumenTable: [],
  };
}

export const TBC = "to be confirmed by architect";
// "White" -> "White, to be confirmed by architect"; nothing -> "To be confirmed by architect".
export function finishText(guess: string) {
  const g = guess.trim().replace(/[,.;\s]+$/, "");
  if (!g) return "To be confirmed by architect";
  return new RegExp(TBC, "i").test(g) ? g : `${g}, ${TBC}`;
}

// Turn an older draft (free label/value rows) into the fixed layout, so nothing typed is lost.
type OldSheet = { type?: string; title?: string; brand?: string; rows?: { label: string; value: string }[]; product?: Picture | null; drawing?: Picture | null; docRef?: string; copyright?: string };
export function upgradeDraft(raw: unknown): Sheet {
  const base = blankSheet();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<Sheet> & OldSheet;
  if (d.v === 2) {
    return { ...base, ...d, specs: { ...base.specs, ...(d.specs ?? {}) }, extras: d.extras ?? [], options: d.options ?? {}, finishOptions: d.finishOptions ?? [], lumenTable: d.lumenTable ?? [] } as Sheet;
  }
  const s: Sheet = { ...base, type: { value: d.type ?? "" }, title: { value: d.title ?? "" }, brand: d.brand ?? "", product: d.product ?? null, drawing: d.drawing ?? null, docRef: d.docRef ?? "", copyright: d.copyright ?? base.copyright };
  const leftovers: string[] = [];
  for (const r of d.rows ?? []) {
    const label = r.label.trim().toLowerCase();
    const value = r.value ?? "";
    if (label === "specifications") {
      for (const line of value.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const plain = line.replace(/\*\*/g, "");
        const beam = plain.match(/^(\d+(?:\.\d+)?)\s*(?:degree|deg|°)\s*beam$/i); // older style "65 degree beam"
        if (beam && !s.specs.beam.value) {
          s.specs.beam = { value: `${beam[1]} degree` };
          continue;
        }
        const f = SPEC_FIELDS.find((x) => plain.toLowerCase().startsWith(x.label.toLowerCase()));
        if (f && !s.specs[f.key].value) s.specs[f.key] = { value: plain.slice(f.label.length).trim() };
        else s.extras.push({ id: newId(), label: "", value: plain });
      }
    } else if ((["description", "supplier", "code", "dimensions", "finish", "notes"] as string[]).includes(label)) {
      s[label as "description"] = { value };
    } else if (value.trim()) {
      leftovers.push(`${r.label}: ${value}`);
    }
  }
  if (leftovers.length) s.notes = { value: [s.notes.value, ...leftovers].filter(Boolean).join("\n") };
  return s;
}

// What the import route returns. Everything is a suggestion and starts unchecked.
export type Extracted = {
  title: string;
  description: string[];
  brand: string;
  code: string;
  specs: Record<SpecKey, string>;
  spec_options: Record<SpecKey, string[]>; // when the product comes in several versions: every choice offered
  lumen_table: LumenRow[];
  extras: { label: string; value: string }[];
  dimensions: string;
  finish: string;       // best guess only, e.g. "White"; finishText() adds "to be confirmed by architect"
  finish_options: string[];
  notes: string[];
  variant: string;
  warnings: string[];
  product_image: string; // URL from the page, or ""
  drawing_image: string;
};

export type ImportResult = {
  extracted: Extracted;
  images: { url: string; alt: string }[]; // pictures found on the page, to pick from
  pdfs: { url: string; text: string }[];  // datasheet links found on the page
  source: string;
};

const got = (v: string): Field => (v.trim() ? { value: v.trim(), unchecked: true } : { value: "" });

// Replace the product details with an import. The designation code, footer and pictures are kept
// (pictures are loaded separately). `supplier` is the Supplier text and whether it came from the
// supplier database (then it doesn't need checking).
export function applyExtracted(sheet: Sheet, x: Extracted, supplier: { text: string; fromList: boolean }): Sheet {
  return {
    ...sheet,
    title: x.title ? got(x.title) : sheet.title,
    brand: x.brand || sheet.brand,
    description: got(x.description.join("\n")),
    supplier: supplier.fromList ? { value: supplier.text } : got(supplier.text),
    code: got(x.code),
    specs: Object.fromEntries(SPEC_FIELDS.map((f) => [f.key, got(x.specs[f.key] ?? "")])) as Record<SpecKey, Field>,
    extras: x.extras.filter((e) => e.value.trim()).map((e) => ({ id: newId(), label: e.label.trim(), value: e.value.trim(), suggested: true })),
    dimensions: got(x.dimensions),
    finish: { value: finishText(x.finish), unchecked: true },
    notes: got(x.notes.join("\n")),
    options: Object.fromEntries(SPEC_FIELDS.map((f) => [f.key, (x.spec_options[f.key] ?? []).filter(Boolean)]).filter(([, o]) => o.length > 1)),
    finishOptions: x.finish_options.length > 1 ? x.finish_options : [],
    lumenTable: x.lumen_table,
  };
}

// Delivered lumens for the chosen connected load and colour temperature, from the manufacturer's table.
const num = (s: string) => s.match(/\d+(?:\.\d+)?/)?.[0] ?? "";
export function lumensFor(sheet: Sheet): string {
  const load = num(sheet.specs.load.value);
  const cct = num(sheet.specs.cct.value);
  if (!load || !sheet.lumenTable.length) return "";
  const rows = sheet.lumenTable.filter((r) => num(r.load) === load);
  const row = rows.find((r) => num(r.cct) === cct) ?? (rows.length === 1 && !num(rows[0].cct) ? rows[0] : undefined);
  return row?.lumens ?? "";
}

// Specs that offer several choices and have none picked yet.
export const toChoose = (sheet: Sheet) => SPEC_FIELDS.filter((f) => (sheet.options[f.key]?.length ?? 0) > 1 && !sheet.specs[f.key].value.trim()).map((f) => f.key);

// ---- output: the same rows feed the on-screen preview and the .docx ----
export type OutLine = { text: string; unchecked: boolean };
export type OutRow = { label: string; lines: OutLine[] };

const lines = (f: Field): OutLine[] => f.value.split("\n").map((t) => t.trimEnd()).filter((t, i, a) => t || a.length > 1).map((text) => ({ text, unchecked: !!f.unchecked }));

export function specLines(sheet: Sheet): OutLine[] {
  const out: OutLine[] = [];
  for (const f of SPEC_FIELDS) {
    const v = sheet.specs[f.key].value.trim();
    if (!v) continue; // not applicable (e.g. tilt on a fixed downlight): left off the sheet
    out.push({ text: `${f.label} ${"bold" in f && f.bold ? `**${v}**` : v}`, unchecked: !!sheet.specs[f.key].unchecked });
  }
  for (const e of sheet.extras) {
    if (e.suggested || !e.value.trim()) continue; // suggestions only go on the sheet once accepted
    out.push({ text: [e.label.trim(), e.value.trim()].filter(Boolean).join(" "), unchecked: false });
  }
  return out;
}

export function outRows(sheet: Sheet): OutRow[] {
  return [
    { label: "Description", lines: lines(sheet.description) },
    { label: "Supplier", lines: lines(sheet.supplier) },
    { label: "Code", lines: lines(sheet.code) },
    { label: "Specifications", lines: specLines(sheet) },
    { label: "Dimensions", lines: lines(sheet.dimensions) },
    { label: "Finish", lines: lines(sheet.finish) },
    { label: "Notes", lines: lines(sheet.notes) },
  ];
}

// How many things still need a tick (fields, suggested extras and imported pictures).
export function uncheckedCount(sheet: Sheet) {
  let n = TEXT_FIELDS.filter((k) => sheet[k].unchecked && sheet[k].value.trim()).length;
  n += SPEC_FIELDS.filter((f) => sheet.specs[f.key].unchecked && sheet.specs[f.key].value.trim()).length;
  n += sheet.extras.filter((e) => e.suggested).length;
  n += [sheet.product, sheet.drawing].filter((p) => p?.unchecked).length;
  n += toChoose(sheet).length;
  return n;
}

// "Colour temperature **4000K**" -> [{text:"Colour temperature ",bold:false},{text:"4000K",bold:true}]
export function runs(line: string): { text: string; bold: boolean }[] {
  return line
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }));
}

export function heading(sheet: Pick<Sheet, "type" | "title">) {
  const t = sheet.title.value.trim().toUpperCase();
  const c = sheet.type.value.trim().toUpperCase();
  return c && t ? `${c} - ${t}` : c || t;
}

export function fileName(sheet: Sheet) {
  const base = heading(sheet).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Datasheet";
  return `${base}.docx`;
}
