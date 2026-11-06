"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import AuthGate from "@/components/AuthGate";
import DbsShell from "@/components/dbs/Shell";
import { supabase } from "@/lib/supabase";

// Admin only: who has DBS access, and the week's join code for new people.
type UserRow = { id: string; email: string; created_at: string; last_sign_in_at: string | null; display_name: string; is_admin_user: boolean; has_access: boolean };

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never";

export default function AdminPage() {
  return <AuthGate wide>{(session) => <Admin session={session} />}</AuthGate>;
}

function Admin({ session }: { session: Session }) {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) setError(error.message);
    else setUsers(data as UserRow[]);
  }, []);

  useEffect(() => {
    supabase.rpc("is_admin").then(({ data }) => {
      setAdmin(data === true);
      if (data === true) load();
    });
  }, [load]);

  async function setAccess(u: UserRow, on: boolean) {
    setError(null);
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, has_access: on } : x)));
    const { error } = await supabase.rpc("admin_set_access", { p_user: u.id, p_on: on });
    if (error) {
      setError(error.message);
      load();
    }
  }

  if (admin === null) return <p className="muted">Loading…</p>;
  if (!admin) {
    return (
      <div className="card stack">
        <h1>Not found</h1>
        <p className="muted">There’s nothing here.</p>
        <div className="row"><Link className="pilllink" href="/">← Back</Link></div>
      </div>
    );
  }

  return (
    <DbsShell title="Admin" subtitle="People and the join code." email={session.user.email} back={{ href: "/", label: "All tools" }}>
      <div className="stack" style={{ maxWidth: 760 }}>
        <JoinCodeCard />
        <section className="card stack">
          <h2>People</h2>
          <p className="muted">New people join at /join with the code above. They can’t open any tools until you tick “DBS access”.</p>
          {error && <p className="error">{error}</p>}
          {users.map((u) => (
            <div key={u.id} className="row" style={{ alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <div className="grow">
                <strong>{u.display_name || u.email}</strong>
                {u.is_admin_user && <span className="pill soon" style={{ marginLeft: 8 }}>Admin</span>}
                <div className="muted">{u.display_name ? `${u.email} · ` : ""}joined {fmt(u.created_at)} · last sign-in {fmt(u.last_sign_in_at)}</div>
              </div>
              {u.is_admin_user ? (
                <span className="muted">Full access</span>
              ) : (
                <label className="checkrow"><input type="checkbox" checked={u.has_access} onChange={(e) => setAccess(u, e.target.checked)} /> DBS access</label>
              )}
            </div>
          ))}
        </section>
      </div>
    </DbsShell>
  );
}
type JoinCode = { code: string; week_start: string; expires_at: string; uses: number; max_uses: number; is_current: boolean };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const plusDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

// This week's join code (made on first view each week), plus last week's while it's still accepted.
function JoinCodeCard() {
  const [codes, setCodes] = useState<JoinCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_join_codes");
    if (error) setError(error.message.includes("admin_join_codes") ? "Join codes aren't set up yet (database migration 0031)." : error.message);
    else setCodes(data as JoinCode[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function copy(what: "code" | "link", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  async function reset() {
    if (!window.confirm("Stop every code that's still accepted (including last week's) and make a new one?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_join_codes_reset");
    setBusy(false);
    if (error) setError(error.message);
    load();
  }

  const current = codes?.find((c) => c.is_current);
  const older = codes?.filter((c) => !c.is_current) ?? [];
  const link = current ? `${window.location.origin}/join?code=${current.code}` : "";

  return (
    <section className="card stack">
      <h2>Join code</h2>
      {error && <p className="error">{error}</p>}
      {!codes && !error && <p className="muted">Loading…</p>}
      {current && (
        <>
          <div className="joincode">{current.code}</div>
          <p className="muted">
            New code every Monday. This one is accepted until {day(current.expires_at)} · used {current.uses} of {current.max_uses}.
            Next code from {day(plusDays(current.week_start, 7))}.
          </p>
          <div className="row wrap">
            <button type="button" className="ghost small" onClick={() => copy("code", current.code)}>{copied === "code" ? "Copied" : "Copy code"}</button>
            <button type="button" className="ghost small" onClick={() => copy("link", link)}>{copied === "link" ? "Copied" : "Copy join link"}</button>
            <button type="button" className="ghost small danger" onClick={reset} disabled={busy}>Stop codes and make a new one</button>
          </div>
        </>
      )}
      {older.map((c) => (
        <p key={c.code} className="muted">
          Last week’s code <strong>{c.code}</strong> still works until {day(c.expires_at)} · used {c.uses} of {c.max_uses}.
        </p>
      ))}
    </section>
  );
}
