"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export default function AuthGate({
  children,
  wide = false,
  app,
}: {
  children: (session: Session) => React.ReactNode;
  wide?: boolean;
  app?: string; // slug of the app this page belongs to; the user must have access to it
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Arrived from a "Forgot password?" email: go straight to setting a new password.
      if (event === "PASSWORD_RECOVERY" && !window.location.pathname.startsWith("/profile")) window.location.assign("/profile?reset=1");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!app || !uid) {
      setAllowed(null);
      return;
    }
    let live = true;
    // has_app_access: the admin, or someone ticked "DBS access" on /admin (migration 0001).
    supabase.rpc("has_app_access", { p_slug: app }).then(({ data }) => {
      if (live) setAllowed(data === true);
    });
    return () => {
      live = false;
    };
  }, [app, uid]);

  const cls = wide ? "wide" : "";
  if (!ready) return <main className={cls}><p className="muted">Loading…</p></main>;
  if (!session) return <main className={cls}><SignIn /></main>;
  if (app && allowed === null) return <main className={cls}><p className="muted">Loading…</p></main>;
  if (app && allowed === false) {
    return (
      <main className={cls}>
        <div className="card stack">
          <h1>No access</h1>
          <p className="muted">You’re signed in, but DBS hasn’t been switched on for you yet. Ask Simon.</p>
          <div className="row"><a className="pilllink" href="/profile">Your profile</a> <button type="button" className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
        </div>
      </main>
    );
  }
  return <main className={cls}>{children(session)}</main>;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"password" | "link">("password");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "link") {
      // Existing accounts only (sign-up stays off); the link brings you back to this page signed in.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) setError(error.message.includes("Signups not allowed") ? "There's no account for that email. Join with a code from Simon first." : error.message);
      else setNotice(`Check ${email} for a sign-in link. It works once and expires in about an hour.`);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === "Invalid login credentials" ? "That email and password don't match. Try a sign-in link instead, or reset your password." : error.message);
    }
    setBusy(false);
  }

  async function forgot() {
    if (!email) return setError("Enter your email first, then tap “Forgot password?”.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/profile?reset=1` });
    setBusy(false);
    if (error) setError(error.message);
    else setNotice(`If ${email} has an account, a reset link is on its way. It opens your Profile page to set a new password.`);
  }

  return (
    <div className="card stack">
      <h1>DBS tools</h1>
      <div className="tabs">
        <button type="button" className={mode === "password" ? "tab on" : "tab"} onClick={() => setMode("password")}>Password</button>
        <button type="button" className={mode === "link" ? "tab on" : "tab"} onClick={() => setMode("link")}>Email me a link</button>
      </div>
      <form className="stack" onSubmit={submit}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        {mode === "password" && (
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        )}
        <button disabled={busy}>{busy ? "Working…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}</button>
      </form>
      {mode === "password" && (
        <button type="button" className="link" style={{ justifySelf: "start", padding: 0 }} onClick={forgot} disabled={busy}>
          Forgot password?
        </button>
      )}
      {notice && <p className="muted">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <p className="muted">New here? <a href="/join">Join with a code from Simon</a></p>
    </div>
  );
}
