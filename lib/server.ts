import { createClient } from "@supabase/supabase-js";

// Server-only helpers for API routes. Never import this from client components.

export async function getUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim()
  );
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user;
}

// Does the signed-in user (identified by the request's token) have access to this app?
export async function hasAppAccess(req: Request, slug: string) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const sb = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim(),
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data, error } = await sb.rpc("has_app_access", { p_slug: slug });
  return !error && data === true;
}
