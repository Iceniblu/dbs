import { NextResponse } from "next/server";
import { getUser, hasAppAccess } from "@/lib/server";
import { fetchBytes, fetchText } from "@/lib/safefetch";
import { digestHtml, extract, ImportError, MODEL } from "@/lib/datasheet-import";
import type { ImportResult } from "@/lib/datasheet";

// Datasheet import for DBS: reads a product page, a PDF link, an uploaded file or pasted text and
// returns suggested datasheet fields (see lib/datasheet-import.ts). Needs ANTHROPIC_API_KEY.

export const maxDuration = 90;

const MAX_UPLOAD_B64 = 4_200_000; // Vercel caps request bodies at ~4.5 MB
const MAX_PDF = 20_000_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type Body = { url?: unknown; pdf_url?: unknown; file?: unknown; media_type?: unknown; name?: unknown; text?: unknown; hints?: unknown };

export async function POST(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasAppAccess(req, "dbs"))) return NextResponse.json({ error: "You don't have access to this app." }, { status: 403 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That's too large or couldn't be read." }, { status: 400 });
  }
  const hints = typeof body.hints === "string" ? body.hints : "";
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  try {
    let result: ImportResult;
    if (s(body.url)) {
      const link = s(body.url);
      const { text: html, url } = await fetchText(link, {
        accept: "text/html,application/xhtml+xml",
        typeRe: /html|xml|text\/plain/i,
        typeError: "That link isn't a web page. If it's a PDF, use the PDF option.",
        maxChars: 4_000_000,
        timeoutMs: 15000,
      });
      const page = digestHtml(html, url);
      if (page.text.length < 200 && !page.jsonld.length && !page.data) {
        throw new ImportError("That page has almost no readable text (it may build itself with JavaScript). Paste the specification text instead, or use the product's PDF datasheet.");
      }
      const fragment = new URL(link).hash.replace(/^#/, "");
      // Most figures (lumens by wattage, cut-out, dimensions) live in the datasheet PDF: read it in the same call.
      const sheetPdf = page.pdfs.find((p) => /data\s*-?sheet|spec(ification)?\s*sheet/i.test(`${p.text} ${p.url}`) && !/install|manual|sdoc|conformity|warranty|brochure|catalog/i.test(`${p.text} ${p.url}`));
      let pdfBlock: { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } } | null = null;
      let pdfNote = "";
      if (sheetPdf) {
        try {
          const { bytes } = await fetchBytes(sheetPdf.url, { accept: "application/pdf", typeRe: /pdf|octet-stream/, typeError: "not a PDF", maxBytes: 15_000_000, timeoutMs: 20000 });
          if (bytes.subarray(0, 5).toString() === "%PDF-") pdfBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } };
        } catch {
          // carry on with the page alone
        }
        pdfNote = pdfBlock ? `The attached PDF is the product's datasheet (${sheetPdf.text}).` : `The page links a datasheet (${sheetPdf.text}) but it couldn't be downloaded.`;
      }
      const material = [
        `Web page: ${url}`,
        fragment ? `URL fragment (often names the variant): #${decodeURIComponent(fragment)}` : "",
        page.title ? `Page title: ${page.title}` : "",
        pdfNote,
        page.data ? `Product data from the page's code (JSON):\n${page.data}` : "",
        page.jsonld.length ? `Structured data:\n${page.jsonld.join("\n")}` : "",
        page.pdfs.length ? `PDF links on the page:\n${page.pdfs.map((p) => `${p.text}: ${p.url}`).join("\n")}` : "",
        `Page text:\n${page.text}`,
      ].filter(Boolean).join("\n\n");
      const extracted = await extract(pdfBlock ? [pdfBlock, { type: "text", text: material }] : [{ type: "text", text: material }], hints, page.images);
      result = { extracted, images: page.images, pdfs: page.pdfs, source: url };
    } else if (s(body.pdf_url)) {
      const { bytes, url } = await fetchBytes(s(body.pdf_url), {
        accept: "application/pdf",
        typeRe: /pdf|octet-stream/,
        typeError: "That link isn't a PDF.",
        maxBytes: MAX_PDF,
        timeoutMs: 25000,
      });
      if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new ImportError("That link isn't a PDF.");
      const extracted = await extract([{ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }], hints, []);
      result = { extracted, images: [], pdfs: [], source: url };
    } else if (s(body.file)) {
      const data = s(body.file);
      const type = s(body.media_type);
      if (data.length > MAX_UPLOAD_B64 || !/^[A-Za-z0-9+/=]+$/.test(data)) throw new ImportError("That file is too large (about 3 MB is the limit) or couldn't be read.", 413);
      const block =
        type === "application/pdf"
          ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
          : IMAGE_TYPES.includes(type)
            ? ({ type: "image", source: { type: "base64", media_type: type, data } } as const)
            : null;
      if (!block) throw new ImportError("Upload a PDF or a picture (JPEG, PNG, WebP).", 415);
      const extracted = await extract([block], hints, []);
      result = { extracted, images: [], pdfs: [], source: s(body.name) || "Uploaded file" };
    } else if (s(body.text)) {
      const extracted = await extract([{ type: "text", text: `Pasted text:\n${s(body.text).slice(0, 100_000)}` }], hints, []);
      result = { extracted, images: [], pdfs: [], source: "Pasted text" };
    } else {
      return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
    }
    return NextResponse.json({ ...result, model: MODEL });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error && e.name !== "AbortError" && e.name !== "TimeoutError" ? e.message : "Couldn't load that link.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
