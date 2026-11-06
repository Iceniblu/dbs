"use client";

import { useState } from "react";
import ContactList from "@/components/dbs/suppliers/ContactList";
import { myPref, removeRow, saveSupplier, supplierContacts, type Directory, type Supplier } from "@/lib/dbs-suppliers";

// One supplier with its details, contacts and the brands it sells. Editing happens in place.
export default function SupplierCard({ supplier, dir, onChange }: { supplier: Supplier | null; dir: Directory; onChange: () => void; }) {
  const [editing, setEditing] = useState(!supplier);
  const [form, setForm] = useState<Omit<Supplier, "id">>({ name: supplier?.name ?? "", phone: supplier?.phone ?? "", email: supplier?.email ?? "", website: supplier?.website ?? "", notes: supplier?.notes ?? "", main_contact_id: supplier?.main_contact_id ?? null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const staff = supplier ? supplierContacts(supplier.id, dir) : [];
  const brands = supplier ? dir.brands.filter((b) => b.supplier_id === supplier.id) : [];

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

  const saveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Give the supplier a name.");
    void act(() => saveSupplier({ ...form, id: supplier?.id }), () => setEditing(false));
  };
  const deleteSupplier = () => {
    if (!supplier) return;
    const msg = brands.length
      ? `Delete ${supplier.name}? Its ${staff.length} contact(s) are deleted too, and ${brands.length} brand(s) will have no supplier.`
      : `Delete ${supplier.name} and its ${staff.length} contact(s)?`;
    if (confirm(msg)) void act(() => removeRow("dbs_suppliers", supplier.id));
  };

  if (editing) {
    return (
      <form className="ds-panel sp-card" onSubmit={saveDetails}>
        <h2 className="dbs-h">{supplier ? `Edit ${supplier.name}` : "New supplier"}</h2>
        <div className="sp-grid">
          <label className="ds-field"><span>Supplier</span><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Modular Partners" autoFocus /></label>
          <label className="ds-field"><span>Phone</span><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="ds-field"><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="ds-field"><span>Website</span><input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></label>
          {supplier && (
            <label className="ds-field">
              <span>Main contact</span>
              <select value={form.main_contact_id ?? ""} onChange={(e) => setForm({ ...form, main_contact_id: e.target.value ? Number(e.target.value) : null })} disabled={staff.length === 0}>
                <option value="">{staff.length ? "None" : "Add contacts on the card first"}</option>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? ` · ${p.title}` : ""}</option>)}
              </select>
            </label>
          )}
          <label className="ds-field sp-wide"><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save supplier"}</button>
          <button type="button" className="ghost" onClick={() => (supplier ? setEditing(false) : onChange())}>Cancel</button>
        </div>
      </form>
    );
  }
  if (!supplier) return null;

  return (
    <article className="ds-panel sp-card">
      <div className="sp-head">
        <div>
          <h3>{supplier.name}</h3>
          <p className="dbs-muted">
            {[supplier.phone, supplier.email].filter(Boolean).join(" · ") || "No phone or email"}
            {supplier.website && <> · <a href={supplier.website} target="_blank" rel="noreferrer">website</a></>}
          </p>
          {supplier.notes && <p className="sp-notes">{supplier.notes}</p>}
        </div>
        <div className="row">
          <button type="button" className="ghost ds-small" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="ghost ds-small sp-danger" onClick={deleteSupplier}>Delete</button>
        </div>
      </div>

      <ContactList
        owner={{ supplier_id: supplier.id }}
        ownerName={supplier.name}
        contacts={staff}
        mainId={supplier.main_contact_id}
        prefId={myPref(dir, { supplier_id: supplier.id })?.contact_id ?? null}
        onChange={onChange}
      />

      <div className="sp-sub">
        <span className="ds-label">Brands</span>
        {brands.length ? <div className="sp-chips">{brands.map((b) => <span key={b.id} className="sp-chip">{b.name}</span>)}</div> : <p className="dbs-muted">No brands linked yet. Link them from the Brands tab.</p>}
      </div>
      {error && <p className="error">{error}</p>}
    </article>
  );
}
