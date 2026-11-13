// Browser-side helpers for the DBS datasheet generator: pictures, API calls and the saved draft.
import { supabase } from "@/lib/supabase";
import { blobToBase64, toJpeg } from "@/lib/image-client";
import { upgradeDraft, type ImportResult, type Picture, type Sheet } from "@/lib/datasheet";

// Any picture (file, pasted, fetched) -> a JPEG data URL of at most 1600px, which Word handles everywhere.
export async function toPicture(blob: Blob, source?: string): Promise<Picture> {
  const jpeg = await toJpeg(blob, 1600, 0.9);
  const bmp = await createImageBitmap(jpeg);
  const pic = { dataUrl: `data:image/jpeg;base64,${await blobToBase64(jpeg)}`, width: bmp.width, height: bmp.height, source };
  bmp.close();
  return pic;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You're signed out.");
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || (res.status === 413 ? "That's too large to send." : `Something went wrong (${res.status}).`));
  return j;
}

// Any combination of sources; they're read together in one import.
export type ImportInput = { url?: string; pdf_url?: string; page_html?: string; page_url?: string; file?: string; media_type?: string; name?: string; text?: string };

// "Copy for DBS" bookmark: run on a manufacturer's page in the person's own browser, it copies the page as
// displayed (styles, inline pictures and SVG stripped to keep it small) with this marker and the address.
// Pasting that into the import reads the page without our server having to fetch it.
export const PAGE_MARKER = "DBS-PAGE-V1 ";
export const BOOKMARKLET =
  "javascript:(function(){try{var h=document.documentElement.outerHTML.replace(/<style[\\s\\S]*?<\\/style>/gi,'').replace(/<svg[\\s\\S]*?<\\/svg>/gi,'').replace(/data:[a-z]+\\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\\/=]+/gi,'');var t='" +
  PAGE_MARKER +
  "'+location.href+'\\n'+h;var ok=function(){alert('Copied for DBS ('+Math.round(t.length/1024)+' KB). Now paste it into the datasheet import.')};var fb=function(){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();ok()};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,fb)}else{fb()}}catch(e){alert('Could not copy this page: '+e)}})();";

export function parseCopiedPage(text: string): { url: string; html: string } | null {
  if (!text.startsWith(PAGE_MARKER)) return null;
  const nl = text.indexOf("\n");
  if (nl < 0) return null;
  const url = text.slice(PAGE_MARKER.length, nl).trim();
  return /^https?:\/\//i.test(url) ? { url, html: text.slice(nl + 1) } : null;
}

export const runImport = (input: ImportInput, hints: string) => post<ImportResult & { model: string }>("/api/dbs/datasheet", { ...input, hints });

export async function pictureFromUrl(url: string): Promise<Picture> {
  const { dataUrl } = await post<{ dataUrl: string }>("/api/dbs/image", { url });
  const blob = await (await fetch(dataUrl)).blob();
  return toPicture(blob, url);
}

export { blobToBase64 };

// ---- draft and footer defaults, kept in this browser only ----
const DRAFT = "dbs.datasheet.draft";
const FOOTER = "dbs.datasheet.footer";

export function loadDraft(): Sheet | null {
  try {
    const raw = localStorage.getItem(DRAFT);
    return raw ? upgradeDraft(JSON.parse(raw)) : null; // older drafts are moved into the fixed layout
  } catch {
    return null;
  }
}
export function saveDraft(sheet: Sheet) {
  try {
    localStorage.setItem(DRAFT, JSON.stringify(sheet));
  } catch {
    // Pictures can exceed the browser's storage quota: keep the text at least.
    try {
      localStorage.setItem(DRAFT, JSON.stringify({ ...sheet, product: null, drawing: null }));
    } catch {
      /* storage unavailable */
    }
  }
  try {
    localStorage.setItem(FOOTER, JSON.stringify({ docRef: sheet.docRef, copyright: sheet.copyright }));
  } catch {
    /* storage unavailable */
  }
}
export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT);
  } catch {
    /* storage unavailable */
  }
}
export function loadFooter(): { docRef: string; copyright: string } | null {
  try {
    const raw = localStorage.getItem(FOOTER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
