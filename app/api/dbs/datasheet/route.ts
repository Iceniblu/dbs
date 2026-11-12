import { NextResponse } from "next/server";
import { getUser, hasAppAccess } from "@/lib/server";
import { fetchBytes, fetchText } from "@/lib/safefetch";
import { digestHtml, extract, ImportError, MODEL, type Block } from "@/lib/datasheet-import";
import type { ImportResult } from "@/lib/datasheet";

// Datasheet import for DBS: reads any combination of a product page (or PDF) link, an uploaded file and
// pasted text, in one Claude call, and returns suggested datasheet fields (see lib/datasheet-import.ts).
// Several sources are cross-checked; conflicts come back as warnings. Needs ANTHROPIC_API_KEY.

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

  const pdfBlock = (bytes: Buffer): Block => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } });
  const fetchPdf = (u: string, maxBytes = MAX_PDF) =>
    fetchBytes(u, { accept: "application/pdf", typeRe: /pdf|octet-stream/, typeError: "That link isn't a PDF.", maxBytes, timeoutMs: 25000 });

  try {
    const blocks: Block[] = [];   // PDFs and pictures
    const texts: string[] = [];   // text material, one section per source
    const sources: string[] = [];
    let images: ImportResult["images"] = [];
    let pdfs: ImportResult["pdfs"] = [];

    // 1. A link: a product page (plus its datasheet PDF), or a PDF itself.
    let link = s(body.url);
    let pdfLink = s(body.pdf_url);
    if (link && /\.pdf(\?|#|$)/i.test(link) && !pdfLink) [pdfLink, link] = [link, ""];
    if (link) {
      const { text: html, url } = await fetchText(link, {
        accept: "text/html,application/xhtml+xml",
        typeRe: /html|xml|text\/plain/i,
        typeError: "That link isn't a web page. If it's a PDF, use the PDF option.",
        maxChars: 4_000_000,
        timeoutMs: 15000,
      });
      const page = digestHtml(html, url);
      const thin = page.text.length < 200 && !page.jsonld.length && !page.data;
      const others = !!(pdfLink || s(body.file) || s(body.text));
      if (thin && !others) {
        throw new ImportError("That page has almost no readable text (it may build itself with JavaScript). Add the product's PDF datasheet or paste the specification text as well.");
      }
      const fragment = new URL(link).hash.replace(/^#/, "");
      // Most figures (lumens by wattage, cut-out, dimensions) live in the datasheet PDF: read it in the same call.
      const sheetPdf = page.pdfs.find((p) => /data\s*-?sheet|spec(ification)?\s*sheet/i.test(`${p.text} ${p.url}`) && !/install|manual|sdoc|conformity|warranty|brochure|catalog/i.test(`${p.text} ${p.url}`));
      let pdfNote = "";
      if (sheetPdf && !pdfLink) {
        try {
          const { bytes } = await fetchPdf(sheetPdf.url, 15_000_000);
          if (bytes.subarray(0, 5).toString() === "%PDF-") {
            blocks.push(pdfBlock(bytes));
            pdfNote = `A PDF attached here is the product's datasheet linked from this page (${sheetPdf.text}).`;
          }
        } catch {
          pdfNote = `The page links a datasheet (${sheetPdf.text}) but it couldn't be downloaded.`;
        }
      }
      texts.push(
        [
          `SOURCE: web page ${url}`,
          thin ? "(This page has almost no readable text.)" : "",
          fragment ? `URL fragment (often names the variant): #${decodeURIComponent(fragment)}` : "",
          page.title ? `Page title: ${page.title}` : "",
          pdfNote,
          page.data ? `Product data from the page's code (JSON):\n${page.data}` : "",
          page.jsonld.length ? `Structured data:\n${page.jsonld.join("\n")}` : "",
          page.pdfs.length ? `PDF links on the page:\n${page.pdfs.map((p) => `${p.text}: ${p.url}`).join("\n")}` : "",
          `Page text:\n${page.text}`,
        ].filter(Boolean).join("\n\n")
      );
      images = page.images;
      pdfs = page.pdfs;
      sources.push(url);
    }
    if (pdfLink) {
      const { bytes, url } = await fetchPdf(pdfLink);
      if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new ImportError("That link isn't a PDF.");
      blocks.push(pdfBlock(bytes));
      texts.push(`SOURCE: PDF from ${url} (attached).`);
      sources.push(url);
    }

    // 2. An uploaded PDF or picture.
    if (s(body.file)) {
      const data = s(body.file);
      const type = s(body.media_type);
      if (data.length > MAX_UPLOAD_B64 || !/^[A-Za-z0-9+/=]+$/.test(data)) throw new ImportError("That file is too large (about 3 MB is the limit) or couldn't be read.", 413);
      if (type === "application/pdf") blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
      else if (IMAGE_TYPES.includes(type)) blocks.push({ type: "image", source: { type: "base64", media_type: type, data } });
      else throw new ImportError("Upload a PDF or a picture (JPEG, PNG, WebP).", 415);
      texts.push(`SOURCE: uploaded file "${s(body.name) || "file"}" (attached).`);
      sources.push(s(body.name) || "Uploaded file");
    }

    // 3. Pasted text.
    if (s(body.text)) {
      texts.push(`SOURCE: text pasted by the person:\n${s(body.text).slice(0, 100_000)}`);
      sources.push("Pasted text");
    }

    if (!sources.length) return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
    if (sources.length > 1) {
      texts.unshift(`There are ${sources.length} sources below, all about the same product. Cross-check them: prefer the manufacturer's PDF datasheet for figures, use the others to confirm or fill gaps, and add a warning for every conflict (say which source says what).`);
    }
    const extracted = await extract([...blocks, { type: "text", text: texts.join("\n\n---\n\n") }], hints, images);
    const result: ImportResult = { extracted, images, pdfs, source: sources.join(" + ") };
    return NextResponse.json({ ...result, model: MODEL });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error && e.name !== "AbortError" && e.name !== "TimeoutError" ? e.message : "Couldn't load that link.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
