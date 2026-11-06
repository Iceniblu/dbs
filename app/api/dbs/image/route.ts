import { NextResponse } from "next/server";
import { getUser, hasAppAccess } from "@/lib/server";
import sharp from "sharp";
import { fetchBytes } from "@/lib/safefetch";

// Fetches a picture from another site for the DBS datasheet generator, so the page can put it in the
// .docx (browsers can't read other sites' images directly). Returns it as a data URL: a JPEG of at most
// 1600px on a white background, so large product photos (often several MB of PNG) fit in the response.

export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasAppAccess(req, "dbs"))) return NextResponse.json({ error: "You don't have access to this app." }, { status: 403 });

  let url = "";
  try {
    const body = (await req.json()) as { url?: unknown };
    url = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    // fall through
  }
  if (!url) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    const { bytes, type } = await fetchBytes(url, {
      accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
      typeRe: /^image\/(jpeg|jpg|png|webp|gif|avif|bmp)$/,
      typeError: "That link isn't a picture.",
      maxBytes: 20_000_000,
    });
    let out: Buffer;
    try {
      out = await sharp(bytes, { limitInputPixels: 80_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 86 })
        .toBuffer();
    } catch {
      if (bytes.length > 3_000_000) throw new Error("That picture couldn't be read.");
      return NextResponse.json({ dataUrl: `data:${type === "image/jpg" ? "image/jpeg" : type};base64,${bytes.toString("base64")}` });
    }
    return NextResponse.json({ dataUrl: `data:image/jpeg;base64,${out.toString("base64")}` });
  } catch (e) {
    const msg = e instanceof Error && e.name !== "AbortError" ? e.message : "Couldn't load that picture.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
