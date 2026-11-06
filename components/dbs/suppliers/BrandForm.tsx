"use client";

import { useState } from "react";
import ContactList from "@/components/dbs/suppliers/ContactList";
import { ownContacts, parseAliases, saveBrand, saveContact, saveSupplier, setMainContact, supplierContacts, supplierLines, type Brand, type Contact, type Directory } from "@/lib/dbs-suppliers";

const NEW = "new";
const NEW_BRAND_CONTACT = "new-brand";
const NEW_SUPPLIER_CONTACT = "new-supplier";

// Add or edit a brand: its supplier, its own contacts and its main contact (one of its own contacts or one of
// the supplier's). A new supplier or contact can be created on the spot.
export default function BrandForm({ dir, brand, initialName = "", onDone, onDelete, onRefresh }: {
  dir: Directory;
  brand: Brand | null;
  initialName?: string;
  onDone: (saved: boolean) => void;
  onDelete?: () => void;
  onRefresh?: () => void; // reload the directory after a contact is added, edited or deleted
}) {
  const [name, setName] = useState(brand?.name ?? initialName);
  const [aliases, setAliases] = useState((brand?.aliases ?? []).join(", "));
  const [supplierId, setSupplierId] = useState<string>(brand?.supplier_id ? String(brand.supplier_id) : "");
  const [contactId, setContactId] = useState<string>(brand?.main_contact_id ? String(brand.main_contact_id) : "");
  const [website, setWebsite] = useState(brand?.website ?? "");
  const [notes, setNotes] = useState(brand?.notes ?? "");
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });
  const [newContact, setNewContact] = useState({ name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Follow the saved main contact when the contact list below changes it (or deletes it).
  const [seenMain, setSeenMain] = useState(brand?.main_contact_id ?? null);
  if (brand && (brand.main_contact_id ?? null) !== seenMain) {
    setSeenMain(brand.main_contact_id ?? null);
    setContactId(brand.main_contact_id ? String(brand.main_contact_id) : "");
  }

  const own = ownContacts(brand?.id ?? null, dir);
  const supplier = supplierId && supplierId !== NEW ? dir.suppliers.find((s) => String(s.id) === supplierId) ?? null : null;
  const staff = supplier ? supplierContacts(supplier.id, dir) : [];
  const creating = contactId === NEW_BRAND_CONTACT || contactId === NEW_SUPPLIER_CONTACT;

  // What the datasheet's Supplier row will say (before saving), for someone with no preference of their own.
  const preview = (() => {
    if (!name.trim()) return "";
    const sid = supplierId === NEW ? -1 : supplierId ? Number(supplierId) : null;
    const draft: Contact | null = creating
      ? { id: -2, supplier_id: contactId === NEW_SUPPLIER_CONTACT ? sid : null, brand_id: contactId === NEW_BRAND_CONTACT ? -3 : null, name: newContact.name || "New contact", title: "", phone: newContact.phone, email: newContact.email, notes: "" }
      : null;
    const draftDir: Directory = {
      brands: dir.brands,
      suppliers: supplierId === NEW ? [...dir.suppliers, { id: -1, name: newSupplier.name || "New supplier", phone: newSupplier.phone, email: "", website: "", notes: "", main_contact_id: null }] : dir.suppliers,
      contacts: [...dir.contacts.map((c) => (brand && c.brand_id === brand.id ? { ...c, brand_id: -3 } : c)), ...(draft ? [draft] : [])],
      prefs: [],
    };
    const pid = creating ? -2 : contactId ? Number(contactId) : null;
    return supplierLines({ id: -3, name: name.trim(), aliases: [], supplier_id: sid, main_contact_id: pid, website: "", notes: "" }, draftDir);
  })();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!name.trim()) throw new Error("Give the brand a name.");
      if (creating && !newContact.name.trim()) throw new Error("Give the new contact a name.");
      let sid: number | null = supplierId && supplierId !== NEW ? Number(supplierId) : null;
      if (supplierId === NEW) {
        if (!newSupplier.name.trim()) throw new Error("Give the new supplier a name.");
        sid = (await saveSupplier({ name: newSupplier.name, phone: newSupplier.phone, email: "", website: "", notes: "" })).id;
      }
      let pid: number | null = contactId && !creating && dir.contacts.some((c) => String(c.id) === contactId) ? Number(contactId) : null;
      if (contactId === NEW_SUPPLIER_CONTACT) {
        if (!sid) throw new Error("Choose the supplier this contact works for.");
        const c = await saveContact({ supplier_id: sid, brand_id: null, name: newContact.name, title: "", phone: newContact.phone, email: newContact.email, notes: "" });
        if (!dir.contacts.some((x) => x.supplier_id === sid)) await setMainContact("dbs_suppliers", sid, c.id); // first contact at the supplier
        pid = c.id;
      }
      const saved = await saveBrand({ id: brand?.id, name, aliases: parseAliases(aliases), supplier_id: sid, main_contact_id: pid, website, notes });
      if (contactId === NEW_BRAND_CONTACT) {
        const c = await saveContact({ supplier_id: null, brand_id: saved.id, name: newContact.name, title: "", phone: newContact.phone, email: newContact.email, notes: "" });
        await setMainContact("dbs_brands", saved.id, c.id);
      }
      onDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ds-panel sp-form">
      <form onSubmit={save}>
        <h2 className="dbs-h">{brand ? `Edit ${brand.name}` : "New brand"}</h2>
        <div className="sp-grid">
          <label className="ds-field"><span>Brand</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Modular" autoFocus /></label>
          <label className="ds-field"><span>Other names (comma separated)</span><input type="text" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Modular Lighting Instruments" /></label>
          <label className="ds-field">
            <span>Supplier</span>
            <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); if (contactId && !own.some((c) => String(c.id) === contactId)) setContactId(""); }}>
              <option value="">No supplier yet</option>
              {dir.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value={NEW}>+ New supplier…</option>
            </select>
          </label>
          <label className="ds-field">
            <span>Main contact</span>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">{supplierId ? "Supplier's main contact" : "None"}</option>
              {own.length > 0 && (
                <optgroup label={`${brand?.name ?? "Brand"} contacts`}>
                  {own.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              )}
              {staff.length > 0 && supplier && (
                <optgroup label={`${supplier.name} contacts`}>
                  {staff.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === supplier.main_contact_id ? " (supplier's main)" : ""}</option>)}
                </optgroup>
              )}
              <option value={NEW_BRAND_CONTACT}>+ New brand contact…</option>
              {supplierId && <option value={NEW_SUPPLIER_CONTACT}>+ New supplier contact…</option>}
            </select>
          </label>
          {supplierId === NEW && (
            <>
              <label className="ds-field"><span>New supplier name</span><input type="text" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} placeholder="Modular Partners" /></label>
              <label className="ds-field"><span>Supplier phone</span><input type="tel" value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} /></label>
            </>
          )}
          {creating && (
            <>
              <label className="ds-field"><span>Contact name</span><input type="text" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} placeholder="Ben Moth" /></label>
              <label className="ds-field"><span>Contact mobile</span><input type="tel" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} placeholder="0414 191 288" /></label>
              <label className="ds-field"><span>Contact email</span><input type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} /></label>
            </>
          )}
          <label className="ds-field"><span>Website</span><input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></label>
          <label className="ds-field sp-wide"><span>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        {preview && (
          <div className="sp-preview">
            <span className="ds-label">On the datasheet (supplier contacts only)</span>
            <pre>{preview}</pre>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save brand"}</button>
          <button type="button" className="ghost" onClick={() => onDone(false)}>Cancel</button>
          {onDelete && <button type="button" className="ghost sp-danger" onClick={onDelete}>Delete brand</button>}
        </div>
      </form>

      {brand ? (
        <ContactList owner={{ brand_id: brand.id }} ownerName={brand.name} contacts={own} mainId={brand.main_contact_id} autoMain={!brand.supplier_id} onChange={() => onRefresh?.()} />
      ) : (
        <p className="dbs-muted">Save the brand to add more of its own contacts.</p>
      )}
    </div>
  );
}
