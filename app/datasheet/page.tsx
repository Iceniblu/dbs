"use client";

import AuthGate from "@/components/AuthGate";
import Generator from "@/components/dbs/datasheet/Generator";

export default function DatasheetPage() {
  return <AuthGate wide app="dbs">{(session) => <Generator email={session.user.email} />}</AuthGate>;
}
