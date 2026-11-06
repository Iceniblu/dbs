"use client";

import { useState } from "react";
import { removeRow, saveContact, setMainContact, setPreference, type Contact } from "@/lib/dbs-suppliers";

type Draft = Omit<Contact, "id"> & { id?: number };

// The contacts of one supplier or one brand, edited in place. Shows which is the main contact and, where there
// is more than one, lets you pick your own preferred contact (only you see that choice).
export default function ContactList({ owner, ownerName, contacts, mainId, prefId, autoMain = true, onChange }: {
  owner: { supplier_id: number } | { brand_id: number };
  ownerName: string;
  contacts: Contact[];
  mainId: number | null;
  prefId?: number | null; // your preferred contact; undefined hides the preference buttons
  autoMain?: boolean; // make the first contact added the main one
  onChange: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSupplier = "supplier_id" in owner;
  const table = isSupplier ? "dbs_suppliers" : "dbs_brands";
  const ownerId = isSupplier ? owner.supplier_id : owner.brand_id;
  const prefTarget = isSupplier ? { supplier_id: owner.supplier_id } : { brand_id: owner.brand_id };

  async function act(work: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await work();
      after?.();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) return setError("Give the contact a name.");
    void act(async () => {
      const saved = await saveContact(draft);
      if (autoMain && !mainId && !draft.id) await setMainContact(table, ownerId, saved.id); // the first contact becomes the main one
    }, () => setDraft(null));
  };

  const blank = (): Draft => ({ supplier_id: isSupplier ? owner.supplier_id : null, brand_id: isSupplier ? null : owner.brand_id, name: "", title: "", phone: "", email: "", notes: "" });

  return (
    <div className="sp-sub">
      <span className="ds-label">Contacts</span>
      {contacts.length === 0 && !draft && <p className="dbs-muted">No contacts yet.</p>}
      {contacts.map((p) =>
        draft?.id === p.id ? null : (
          <div key={p.id} className="sp-person">
            <div>
              <b>{p.name}</b>{p.title && <span className="dbs-muted"> · {p.title}</span>}
              {p.id === mainId && <span className="sp-badge">Main contact</span>}
              {prefId === p.id && <span className="sp-badge sp-badge-mine">Your preferred</span>}
              <div className="dbs-muted">{[p.phone && `Mobile ${p.phone}`, p.email].filter(Boolean).join(" · ") || "No mobile or email"}</div>
            </div>
            <div className="row">
              {prefId !== undefined && contacts.length > 1 && (
                prefId === p.id
                  ? <button type="button" className="ghost ds-small" disabled={busy} onClick={() => act(() => setPreference(prefTarget, null))}>Clear my preference</button>
                  : <button type="button" className="ghost ds-small" disabled={busy} onClick={() => act(() => setPreference(prefTarget, p.id))}>Prefer</button>
              )}
              <button type="button" className="ghost ds-small" onClick={() => setDraft(p)}>Edit</button>
              <button type="button" className="ghost ds-small sp-danger" onClick={() => confirm(`Delete ${p.name}?`) && act(() => removeRow("dbs_contacts", p.id))}>Delete</button>
            </div>
          </div>
        )
      )}
      {draft && (
        <form className="sp-person-form" onSubmit={save}>
          <div className="sp-grid">
            <label className="ds-field"><span>Name</span><input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus /></label>
            <label className="ds-field"><span>Role</span><input type="text" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Specification sales" /></label>
            <label className="ds-field"><span>Mobile</span><input type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="0414 191 288" /></label>
            <label className="ds-field"><span>Email</span><input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
          </div>
          <div className="row">
            <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save contact"}</button>
            <button type="button" className="ghost" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}
      {!draft && (
        <div className="row">
          <button type="button" className="ghost ds-small" onClick={() => setDraft(blank())}>+ Add contact for {ownerName}</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
