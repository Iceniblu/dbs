"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// Create your own account with the three-word join code Simon gives you. The code is checked by the
// database when the account is saved (migration 0031), so this page can't let anyone in without one.
// Letters only; case doesn't matter (the database compares in lower case).
const tidy = (c: string) => c.replace(/[^A-Za-z]+/g, "");

export default function JoinPage() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code");
    if (c) setCode(tidy(c));
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const joinCode = tidy(code);
    if (joinCode.length < 9) return setError("The join code is three words run together, like MapleRiverTeapot.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { join_code: joinCode, display_name: name.trim() }, emailRedirectTo: `${window.location.origin}/` },
    });
    setBusy(false);
    if (error) {
      const m = error.message;
      if (/database error/i.test(m)) setError("That join code isn't right, or it has expired. Check it with Simon. Codes change every week.");
      else if (/signups? not allowed/i.test(m)) setError("Joining isn't switched on right now. Ask Simon.");
      else if (/rate limit|too many/i.test(m)) setError("Too many tries. Wait a few minutes and try again.");
      else setError(m);
      return;
    }
    if (data.session) window.location.assign("/");
    else setSent(email.trim());
  }

  if (signedIn) {
    return (
      <main>
        <div className="card stack">
          <h1>You’re already signed in</h1>
          <div className="row"><Link className="pilllink" href="/">← Go to your apps</Link></div>
        </div>
      </main>
    );
  }

  if (sent) {
    return (
      <main>
        <div className="card stack">
          <h1>Check your email</h1>
          <p>We’ve sent a link to <strong>{sent}</strong>. Open it to confirm your email and finish joining.</p>
          <p className="muted">
            Nothing there after a few minutes? Check your spam folder. If you already had an account, just sign in instead.
            Simon will switch on the apps you’ll use.
          </p>
          <div className="row"><Link className="pilllink" href="/">Go to sign in</Link></div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card stack">
        <h1>Join</h1>
        <p className="muted">Ask Simon for this week’s join code: three words run together, like <em>MapleRiverTeapot</em>. Capitals don’t matter.</p>
        <form className="stack" onSubmit={submit}>
          <input
            type="text"
            placeholder="Join code"
            value={code}
            onChange={(e) => setCode(tidy(e.target.value))}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            aria-label="Join code"
          />
          <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoComplete="name" aria-label="Your name" />
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" aria-label="Email" />
          <input type="password" placeholder="Choose a password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" aria-label="Password" />
          <button disabled={busy}>{busy ? "Working…" : "Join"}</button>
        </form>
        {error && <p className="error">{error}</p>}
        <p className="muted">Already have an account? <Link href="/">Sign in</Link></p>
      </div>
    </main>
  );
}
