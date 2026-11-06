"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthGate from "@/components/AuthGate";
import DbsShell from "@/components/dbs/Shell";
import { saveDisplayName } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

// Your name (shown in the header and to the admin) and password. Open to anyone signed in, with or without DBS access.
export default function ProfilePage() {
  return <AuthGate wide>{(session) => <Profile session={session} />}</AuthGate>;
}

function Profile({ session }: { session: Session }) {
  return (
    <DbsShell title="Your profile" subtitle={session.user.email} email={session.user.email} back={{ href: "/", label: "All tools" }}>
      <div className="stack" style={{ maxWidth: 560 }}>
        <NameCard userId={session.user.id} />
        <PasswordCard />
      </div>
    </DbsShell>
  );
}

function NameCard({ userId }: { userId: string }) {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle().then(({ data }) => setName(data?.display_name ?? ""));
  }, [userId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const error = await saveDisplayName(userId, name);
    setErr(error);
    if (!error) setMsg("Saved.");
  }

  return (
    <section className="card stack">
      <h2>Name</h2>
      <form className="row" onSubmit={submit}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Your name" aria-label="Your name" />
        <button>Save</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </section>
  );
}

// Set or change your password (also where the "Forgot password?" email lands, with ?reset=1).
function PasswordCard() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reset, setReset] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reset")) setReset(true);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (pw.length < 8) return setErr("Use at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setErr(error.message);
    setPw("");
    setPw2("");
    setReset(false);
    setMsg("Password saved. You can sign in with it next time, or keep using email links.");
    window.history.replaceState(null, "", "/profile");
  }

  return (
    <section className="card stack" id="password">
      <h2>{reset ? "Set a new password" : "Password"}</h2>
      {reset && <p className="muted">You're signed in from the reset email. Choose a new password below.</p>}
      <form className="stack" onSubmit={submit}>
        <input type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        <input type="password" placeholder="Repeat new password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        <button disabled={!pw || !pw2}>Save password</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      {err && <p className="error">{err}</p>}
      <p className="muted">You can also skip passwords: on the sign-in page choose “Email me a link”.</p>
    </section>
  );
}
