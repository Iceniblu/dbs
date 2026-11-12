# DBS datasheet generator

Route `/datasheet`. Anyone with DBS access (switched on in /admin) can use it.

## What it does
Makes a single-page datasheet in the layout of the DBS electrical schedules and downloads it as Word (.docx).

**Fixed layout:** product photo and dimension drawing / designation ("D4 - RECESSED FIXED DOWNLIGHT") / Description / Supplier / Code / Specifications / Dimensions / Finish / Notes.
- **Specifications** are fixed fields, printed as label then value in this order: IP rating, Beam angle, Tilt, CRI, Colour temperature (value in bold), Delivered lumens, Connected load. An empty field (e.g. tilt on a fixed downlight) is left off the sheet. Extra lines (UGR, IK, dimming…) can be added; ones suggested by the import are dark red and only go on the sheet once accepted (✓ Add).
- **Supplier** comes from the brand via the supplier database: `Brand` / `Contact Name @ Supplier: Mobile`. If the brand isn't in the list, an add-brand form (with new supplier and contact if needed) opens on the datasheet.
- **Finish:** the import's best guess plus "to be confirmed by architect" (e.g. "White, to be confirmed by architect").
- **Pictures:** import tries to find both; a missing one is highlighted on screen and becomes a red "… REQUIRED" placeholder in Word (`public/dbs/required-*.png`). Pictures can be uploaded, pasted (Ctrl+V) or loaded from a link.

**Checking:** everything the import fills starts red on screen with a ✓ to mark it checked; editing a value also marks it checked, and the supplier database counts as checked. Red is on screen only (the Word file prints normally). Downloading with unchecked items or missing pictures asks for confirmation first.

**Options:** when a product comes in several versions (wattages, colour temperatures, beams, finishes), the import lists every choice as chips under the field and leaves it empty (dashed red) unless the hints settle it. Single-value specs fill directly. Delivered lumens fill in from the manufacturer's lumen table (by connected load and colour temperature) once both are chosen.

**Quick buttons:** beside Description, **Surface / Rod / Wire / Ceiling / Grid** set the start of line 1 ("Surface mounted", "Rod suspended", "Wire suspended", "Ceiling recessed", "Grid ceiling recessed") and the driver line (remote for recessed, integral otherwise). Beside Notes, **Track accessories** adds "Track supplied with all required mounting accessories to suit arrangement shown on drawings." (the import also adds it for lighting track).

**Import (best effort):** any combination of a product page link (or PDF link), an uploaded PDF or picture (up to 3 MB) and pasted text, read together in one request and cross-checked (conflicts become warnings), with optional "options to pick" hints (a URL fragment such as `#smart-lotis-115` is a hint too). Reads product data hidden in the page's code (Next.js data, JSON in attributes such as Vue `:product-data`, Inertia `data-page`), and automatically reads the product's datasheet PDF in the same request when the page links one. Lists other pictures and PDFs found on the page.

**Word layout:** one table, matched to Simon's corrected D2 datasheet: picture row (226.75pt; photo cell 2268+2834 twips, drawing cell 5103), cream title row, then the rows (label 2268 twips, value 7937). Grey 0.5pt `BFBFBF` lines come from the table (top, bottom, between rows); the top one is the line under the header. Every paragraph is 3pt before / 3pt after, single line (`lineRule` auto, set explicitly); cell padding 2.85pt top/bottom, 5.4pt sides. Colour temperature stays bold. Lumens always carry a unit: `lm` for single luminaires, `lm/m` for linear luminaires by length.

**Page layout:** the navy band holds the project info on the right: document reference and copyright line (the Word footer, remembered in the browser), **Download Word** and **Start new**. Type sits above Import. "Other specifications" is collapsed by default.

**Description:** two lines. Line 1: mounting type then luminaire type (e.g. "Ceiling recessed LED directional downlight", "Suspended LED linear extrusion", "Track mounted directional spotlight"). Line 2: "Supplied with remote DALI driver" if recessed, "Supplied with integral DALI driver" if surface mounted, suspended or track mounted. No brand or product name (they go in Supplier and Code).

**Footer text:** The draft is kept in this browser until "Start new"; drafts from the older free-row layout are converted.

## Setup
Import needs `ANTHROPIC_API_KEY` (server-side, already used by J.A.R.V.I.S.). Optional `DBS_DATASHEET_MODEL` overrides the model (default `claude-opus-5-5`, low effort, with the API's default refusal fallback). Without the key, everything except import works.

Pages that build themselves with JavaScript may have little readable text: use the PDF datasheet link, upload, or paste the text instead.

## Where the logic is
`lib/datasheet.ts` (fixed layout, checking state, draft upgrade, output rows), `lib/datasheet-import.ts` (page digest and Claude extraction, server-only), `lib/datasheet-docx.ts` (Word builder), `lib/datasheet-client.ts` (browser helpers, draft), `components/dbs/datasheet/*` (`CheckField.tsx` is the red/tick field), `app/dbs/datasheet/*`, `app/api/dbs/datasheet/route.ts` (import), `app/api/dbs/image/route.ts` (fetches pictures from other sites for the .docx), `public/dbs/header.png` and `hatch.png` (page art, measured from a DBS schedule PDF).

## Supplier database (`/suppliers`)
Tables `dbs_brands`, `dbs_suppliers`, `dbs_contacts`, `dbs_contact_prefs` (migration `0003_dbs_suppliers.sql`; access as for DBS). Brands and suppliers each have any number of contacts and one **main contact**, chosen in their Edit view. A contact's phone is their mobile (shown as "Mobile"). Where there's more than one contact, each person can pick their own **preferred contact** (Brands table "My contact", or **Prefer** on a supplier's card); only they see it. Datasheets only ever show a **supplier** contact (a brand's own contacts are for reference). The one used is, in order: your preferred contact for the brand, the brand's main contact, your preferred contact at its supplier, the supplier's main contact, then anyone at the supplier; each step only counts if it's a supplier contact. Brands have "other names" so imports such as "Modular Lighting Instruments" match "Modular". Matching and the Supplier row text live in `lib/dbs-suppliers.ts`; pages in `components/dbs/suppliers/*`.

## Later
Field sets per fitting type (downlight, linear, emergency, power…) could move into a database table so each type starts with its own rows.
