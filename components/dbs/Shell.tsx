"use client";

import { useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import Logo, { Mark } from "@/components/dbs/Logo";

// Branded frame for every DBS page: navy header band with the logo, the navy-to-teal rule, and the
// report-style footer. Styles live in app/dbs.css (loaded by app/layout.tsx).
export default function DbsShell({
  title,
  subtitle,
  email,
  back,
  children,
}: {
  title: string;
  subtitle?: string;
  email?: string;
  back?: { href: string; label: string }; // omitted on the home page
  children: React.ReactNode;
}) {
  const { display_name } = useProfile();
  const who = display_name.trim() || email;

  useEffect(() => {
    document.body.classList.add("dbs-page");
    return () => document.body.classList.remove("dbs-page");
  }, []);

  return (
    <div className="dbs">
      <header className="dbs-hero">
        <div className="dbs-bar">
          {back ? <Link href={back.href} className="dbs-back">← {back.label}</Link> : <span />}
          <div className="dbs-user">
            {who && <Link href="/profile" className="dbs-back">{who}</Link>}
            <button className="dbs-signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
        <Logo />
        <div className="dbs-titles">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <Mark tone="light" size={220} />
      </header>
      <div className="dbs-rule" aria-hidden="true" />
      <div className="dbs-body">{children}</div>
      <footer className="dbs-foot">
        <span>DBS Consulting · Internal tools</span>
        <span className="dbs-hatch" aria-hidden="true" />
      </footer>
    </div>
  );
}
