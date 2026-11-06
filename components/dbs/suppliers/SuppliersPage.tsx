"use client";

import { useCallback, useEffect, useState } from "react";
import DbsShell from "@/components/dbs/Shell";
import BrandForm from "@/components/dbs/suppliers/BrandForm";
import SupplierCard from "@/components/dbs/suppliers/SupplierCard";
import { brandContacts, contactFor, loadDirectory, myPref, removeRow, setPreference, whyLabel, type Brand, type Directory } from "@/lib/dbs-suppliers";

type Tab = "brands" | "suppliers";

// The DBS supplier database: brands -> supplier, each with contacts. Page: app/suppliers/page.tsx.
// ?add=<brand name> opens a new brand form with that name (used from the datasheet generator).
export default function SuppliersPage({ email }: { email?: string }) {
  const [dir, setDir] = useState<Directory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("brands");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ brand: Brand | null; name?: string } | null>(null);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [fromDatasheet, setFromDatasheet] = useState(false);

  const reload = useCallback(() => {
    loadDirectory().then(setDir, (e) => setError(e instanceof Error ? e.message : "Couldn't load the supplier list."));
  }, []);
  useEffect(() => {
    reload();
    const add = new URLSearchParams(window.location.search).get("add");
    if (add) {
      setEditing({ brand: null, name: add });
      setFromDatasheet(true);
    }
  }, [reload]);

  const match = (...xs: string[]) => !q.trim() || xs.join(" ").toLowerCase().includes(q.trim().toLowerCase());

  function brandDone(saved: boolean) {
    setEditing(null);
    if (saved) reload();
  }
  async function deleteBrand(b: Brand) {
    if (!confirm(`Delete the brand ${b.name}?`)) return;
    try {
      await removeRow("dbs_brands", b.id);
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete.");
    }
  }

  return (
    <DbsShell title="Suppliers" subtitle="Brands, the suppliers who sell them, and who to call." email={email} back={{ href: "/", label: "All tools" }}>
      {error && <p className="error">{error}</p>}
      {!dir && !error && <p className="dbs-muted">Loading…</p>}
      {dir && (
        <div className="sp-page">
          {fromDatasheet && (
            <p className="sp-note">
              Adding a brand from the datasheet generator. <a href="/datasheet">Back to the datasheet</a> when you&rsquo;re done; it will pick up the new brand.
            </p>
          )}
          <div className="sp-bar">
            <div className="ds-tabs" role="tablist" aria-label="Show">
              {([["brands", `Brands (${dir.brands.length})`], ["suppliers", `Suppliers (${dir.suppliers.length})`]] as const).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "ds-tab on" : "ds-tab"} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>
            <input className="sp-search" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            {tab === "brands" ? (
              <button type="button" onClick={() => setEditing({ brand: null })}>+ Add brand</button>
            ) : (
              <button type="button" onClick={() => setAddingSupplier(true)}>+ Add supplier</button>
            )}
          </div>

          {tab === "brands" && (
            <>
              {editing && (
                <BrandForm
                  key={editing.brand?.id ?? `new-${editing.name ?? ""}`}
                  dir={dir}
                  brand={editing.brand ? dir.brands.find((b) => b.id === editing.brand!.id) ?? editing.brand : null}
                  onRefresh={reload}
                  initialName={editing.name}
                  onDone={brandDone}
                  onDelete={editing.brand ? () => deleteBrand(editing.brand!) : undefined}
                />
              )}
              {dir.brands.length === 0 ? (
                <div className="dbs-empty"><p>No brands yet.</p><p className="dbs-muted">Add a brand and link it to its supplier and contacts.</p></div>
              ) : (
                <div className="sp-table-wrap">
                  <table className="dbs-table sp-table">
                    <thead><tr><th>Brand</th><th>Supplier</th><th>Contact</th><th>Mobile</th><th aria-label="Actions" /></tr></thead>
                    <tbody>
                      {dir.brands.map((b) => {
                        const { supplier, person, why } = contactFor(b, dir);
                        const options = brandContacts(b, dir);
                        const pref = myPref(dir, { brand_id: b.id });
                        if (!match(b.name, ...b.aliases, supplier?.name ?? "", person?.name ?? "")) return null;
                        return (
                          <tr key={b.id}>
                            <td><b>{b.name}</b>{b.aliases.length > 0 && <div className="dbs-muted">{b.aliases.join(", ")}</div>}</td>
                            <td>{supplier?.name ?? <span className="dbs-muted">None</span>}</td>
                            <td>
                              {person ? <>{person.name}{why && whyLabel[why] && <span className="dbs-muted"> ({whyLabel[why]})</span>}</> : <span className="dbs-muted">None</span>}
                              {options.length > 1 && (
                                <select
                                  className="sp-pref"
                                  value={pref && options.some((c) => c.id === pref.contact_id) ? pref.contact_id : ""}
                                  onChange={(e) => setPreference({ brand_id: b.id }, e.target.value ? Number(e.target.value) : null).then(reload, (err) => setError(err instanceof Error ? err.message : "Couldn't save."))}
                                  aria-label={`Your preferred contact for ${b.name}`}
                                >
                                  <option value="">My contact: main</option>
                                  {options.map((c) => <option key={c.id} value={c.id}>My contact: {c.name}</option>)}
                                </select>
                              )}
                            </td>
                            <td>{person?.phone || (supplier?.phone ? <span className="dbs-muted">{supplier.phone} (supplier)</span> : "")}</td>
                            <td><button type="button" className="ghost ds-small" onClick={() => setEditing({ brand: b })}>Edit</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === "suppliers" && (
            <div className="sp-cards">
              {addingSupplier && <SupplierCard supplier={null} dir={dir} onChange={() => { setAddingSupplier(false); reload(); }} />}
              {dir.suppliers.length === 0 && !addingSupplier && <div className="dbs-empty"><p>No suppliers yet.</p></div>}
              {dir.suppliers
                .filter((s) => match(s.name, s.phone, s.email, ...dir.contacts.filter((p) => p.supplier_id === s.id).map((p) => p.name), ...dir.brands.filter((b) => b.supplier_id === s.id).map((b) => b.name)))
                .map((s) => <SupplierCard key={s.id} supplier={s} dir={dir} onChange={reload} />)}
            </div>
          )}
        </div>
      )}
    </DbsShell>
  );
}
