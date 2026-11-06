import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Server-only. Fetches a user-supplied URL while refusing private/internal addresses.

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}
function privateIp(ip: string) {
  if (isIP(ip) === 4) return privateV4(ip);
  const l = ip.toLowerCase();
  if (l === "::1" || l === "::" || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb") || l.startsWith("fc") || l.startsWith("fd")) return true;
  const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return m ? privateV4(m[1]) : false;
}

export async function assertPublic(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http and https links are supported.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("That link can't be fetched.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("That link can't be fetched.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("That link can't be fetched.");
}

// Follows up to 5 redirects, checking every hop against assertPublic.
async function safeGet(start: string, accept: string, timeoutMs: number, read: (res: Response) => Promise<void>): Promise<string> {
  let url = new URL(start);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: accept,
          "Accept-Language": "en-AU,en;q=0.9",
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (!res.ok) throw new Error(`The site returned an error (${res.status}).`);
      await read(res);
      return url.toString();
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects.");
}

export async function fetchText(
  start: string,
  opts: { accept: string; typeRe?: RegExp; typeError?: string; maxChars?: number; timeoutMs?: number }
): Promise<{ text: string; url: string }> {
  let text = "";
  const url = await safeGet(start, opts.accept, opts.timeoutMs ?? 12000, async (res) => {
    const type = res.headers.get("content-type") ?? "";
    if (opts.typeRe && !opts.typeRe.test(type)) throw new Error(opts.typeError ?? "Unexpected content type.");
    text = (await res.text()).slice(0, opts.maxChars ?? 3_000_000);
  });
  return { text, url };
}

// Binary download (images, PDFs). Refuses anything over maxBytes.
export async function fetchBytes(
  start: string,
  opts: { accept: string; typeRe: RegExp; typeError: string; maxBytes: number; timeoutMs?: number }
): Promise<{ bytes: Buffer; type: string; url: string }> {
  let bytes = Buffer.alloc(0);
  let type = "";
  const url = await safeGet(start, opts.accept, opts.timeoutMs ?? 15000, async (res) => {
    type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!opts.typeRe.test(type)) throw new Error(opts.typeError);
    if (Number(res.headers.get("content-length") ?? 0) > opts.maxBytes) throw new Error("That file is too large.");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > opts.maxBytes) throw new Error("That file is too large.");
    bytes = buf;
  });
  return { bytes, type, url };
}
