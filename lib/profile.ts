"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// The signed-in person's profile (just a display name here), cached for the header.
export type Profile = { display_name: string };

export function useProfile(): Profile {
  const [p, setP] = useState<Profile>({ display_name: "" });
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id;
      if (!uid) return;
      const { data: row } = await supabase.from("profiles").select("display_name").eq("user_id", uid).maybeSingle();
      if (live && row) setP({ display_name: row.display_name ?? "" });
    });
    return () => {
      live = false;
    };
  }, []);
  return p;
}

export async function saveDisplayName(userId: string, name: string) {
  const { error } = await supabase.from("profiles").upsert({ user_id: userId, display_name: name.trim().slice(0, 40), updated_at: new Date().toISOString() });
  return error?.message ?? null;
}
