"use client";

import AuthGate from "@/components/AuthGate";
import SuppliersPage from "@/components/dbs/suppliers/SuppliersPage";

export default function Page() {
  return <AuthGate wide app="dbs">{(session) => <SuppliersPage email={session.user.email} />}</AuthGate>;
}
