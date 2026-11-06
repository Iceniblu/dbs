import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

export const supabase = createClient(
  SUPABASE_URL || "https://missing.invalid",
  SUPABASE_KEY || "missing"
);
