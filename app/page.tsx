"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import DbsShell from "@/components/dbs/Shell";
import { supabase } from "@/lib/supabase";

// The DBS home page: one card per tool. Add an entry here when a new tool is built at app/<slug>/page.tsx
// (wrap that page in <AuthGate app="dbs"> and <DbsShell>, so it shares DBS's access and look).
const TOOLS: { slug: string; name: string; description: string; icon: string }[] = [
  { slug: "datasheet", name: "Datasheet generator", description: "Product page, PDF or specs in, DBS schedule datasheet (.docx) out.", icon: "📄" },
  { slug: "suppliers", name: "Suppliers", description: "Brands, the suppliers who sell them, and their contacts.", icon: "📇" },
];

export default function Home() {
  return <AuthGate wide app="dbs">{(session) => <Dbs email={session.user.email} />}</AuthGate>;
}

function Dbs({ email }: { email?: string }) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    supabase.rpc("is_admin").then(({ data }) => setAdmin(data === true));
  }, []);
  return (
    <DbsShell title="Work tools" subtitle="Engineering and project tools for DBS Consulting." email={email}>
      <h2 className="dbs-h">Tools</h2>
      <div className="dbs-grid">
        {TOOLS.map((t, i) => (
          <Link key={t.slug} href={`/${t.slug}`} className="dbs-card">
            <span className="dbs-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="dbs-icon">{t.icon}</span>
            <span className="dbs-name">{t.name}</span>
            <span className="dbs-muted">{t.description}</span>
          </Link>
        ))}
      </div>
      {admin && <p className="dbs-muted" style={{ marginTop: 24 }}><Link href="/admin">Admin: people and join code →</Link></p>}
    </DbsShell>
  );
}
