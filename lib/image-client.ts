// Browser-side image helpers (shrink to JPEG, read as base64).

export async function toJpeg(file: Blob, maxEdge: number, quality = 0.85): Promise<Blob> {
  let src: CanvasImageSource;
  let w = 0;
  let h = 0;
  let revoke: string | null = null;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    src = bmp; w = bmp.width; h = bmp.height;
  } catch {
    const url = URL.createObjectURL(file);
    revoke = url;
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("That file couldn't be read as a picture. Try a JPEG or PNG."));
      img.src = url;
    });
    src = img; w = img.naturalWidth; h = img.naturalHeight;
  }
  try {
    if (!w || !h) throw new Error("That file couldn't be read as a picture. Try a JPEG or PNG.");
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const g = canvas.getContext("2d");
    if (!g) throw new Error("This browser can't process photos.");
    g.fillStyle = "#ffffff"; // transparent PNGs become white, not black
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(src, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't prepare that photo."))), "image/jpeg", quality)
    );
  } finally {
    if (revoke) URL.revokeObjectURL(revoke);
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(new Error("Couldn't read the photo."));
    r.readAsDataURL(blob);
  });
}
