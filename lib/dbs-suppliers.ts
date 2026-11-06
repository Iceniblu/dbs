// DBS supplier database (tables dbs_brands, dbs_suppliers, dbs_contacts, dbs_contact_prefs; migrations 0026, 0033).
// Brands link to the supplier that sells them. Brands and suppliers each have contacts and a main contact;
// each person can also pick a preferred contact. The datasheet generator uses this to fill the Supplier row.
import { supabase } from "@/lib/supabase";

export type Supplier = { id: number; name: string; phone: string; email: string; website: string; notes: string; main_contact_id: number | null };
export type Contact = { id: number; supplier_id: number | null; brand_id: number | null; name: string; title: string; phone: string; email: string; notes: string };
export type Brand = { id: number; name: string; aliases: string[]; supplier_id: number | null; main_contact_id: number | null; website: string; notes: string };
export type Pref = { id: number; brand_id: number | null; supplier_id: number | null; contact_id: number };
export type Directory = { brands: Brand[]; suppliers: Supplier[]; contacts: Contact[]; prefs: Pref[] };

export async function loadDirectory(): Promise<Directory> {
  const [b, s, c, p] = await Promise.all([
    supabase.from("dbs_brands").select("id, name, aliases, supplier_id, main_contact_id, website, notes").order("name"),
    supabase.from("dbs_suppliers").select("id, name, phone, email, website, notes, main_contact_id").order("name"),
    supabase.from("dbs_contacts").select("id, supplier_id, brand_id, name, title, phone, email, notes").order("name"),
    supabase.from("dbs_contact_prefs").select("id, brand_id, supplier_id, contact_id"),
  ]);
  const err = b.error ?? s.error ?? c.error ?? p.error;
  if (err) throw new Error(err.message);
  return { brands: (b.data ?? []) as Brand[], suppliers: (s.data ?? []) as Supplier[], contacts: (c.data ?? []) as Contact[], prefs: (p.data ?? []) as Pref[] };
}

export const supplierContacts = (supplierId: number | null, dir: Directory) => (supplierId == null ? [] : dir.contacts.filter((c) => c.supplier_id === supplierId));
export const ownContacts = (brandId: number | null, dir: Directory) => (brandId == null ? [] : dir.contacts.filter((c) => c.brand_id === brandId));
// Everyone who can be the contact for a brand: its own contacts first, then its supplier's.
export const brandContacts = (brand: Brand, dir: Directory) => [...ownContacts(brand.id, dir), ...supplierContacts(brand.supplier_id, dir)];

export const myPref = (dir: Directory, target: { brand_id?: number; supplier_id?: number }) =>
  dir.prefs.find((p) => (target.brand_id != null ? p.brand_id === target.brand_id : p.supplier_id === target.supplier_id)) ?? null;

export type Why = "yours" | "main" | "supplier-yours" | "supplier-main" | "only" | null;

// The supplier's contact: your preferred one, else its main contact, else its first.
export function supplierContactFor(supplier: Supplier, dir: Directory): { person: Contact | null; why: Why } {
  const staff = supplierContacts(supplier.id, dir);
  const pref = myPref(dir, { supplier_id: supplier.id });
  const yours = pref && staff.find((c) => c.id === pref.contact_id);
  if (yours) return { person: yours, why: "yours" };
  const main = staff.find((c) => c.id === supplier.main_contact_id);
  if (main) return { person: main, why: "main" };
  return { person: staff[0] ?? null, why: staff[0] ? "only" : null };
}

// The contact for a brand, most specific first: your preferred contact for the brand, the brand's main contact,
// your preferred contact at its supplier, the supplier's main contact, then anyone listed.
// With supplierOnly (the datasheet), the brand's own contacts are skipped: only supplier contacts go on datasheets.
export function contactFor(brand: Brand, dir: Directory, supplierOnly = false): { supplier: Supplier | null; person: Contact | null; why: Why } {
  const supplier = dir.suppliers.find((s) => s.id === brand.supplier_id) ?? null;
  const options = supplierOnly ? supplierContacts(brand.supplier_id, dir) : brandContacts(brand, dir);
  const pref = myPref(dir, { brand_id: brand.id });
  const yours = pref && options.find((c) => c.id === pref.contact_id);
  if (yours) return { supplier, person: yours, why: "yours" };
  const main = options.find((c) => c.id === brand.main_contact_id);
  if (main) return { supplier, person: main, why: "main" };
  if (supplier) {
    const s = supplierContactFor(supplier, dir);
    if (s.person) return { supplier, person: s.person, why: s.why === "yours" ? "supplier-yours" : s.why === "main" ? "supplier-main" : "only" };
  }
  const first = options[0] ?? null;
  return { supplier, person: first, why: first ? "only" : null };
}

export const whyLabel: Record<Exclude<Why, null>, string> = {
  yours: "your pick",
  main: "main",
  "supplier-yours": "your pick at supplier",
  "supplier-main": "supplier's main",
  only: "",
};

// Supplier row text in the schedules' style (a contact's "phone" is their mobile). Only supplier contacts are used:
//   Modular
//   Contact Ben Moth @ Modular Partners: 0414 191 288
export function supplierLines(brand: Brand, dir: Directory): string {
  const { supplier, person } = contactFor(brand, dir, true);
  const lines = [brand.name];
  if (supplier) {
    const reach = (person ? person.phone || person.email : "") || supplier.phone || supplier.email;
    const who = person ? `Contact ${person.name} @ ${supplier.name}` : `Contact ${supplier.name}`;
    lines.push(reach ? `${who}: ${reach}` : who);
  }
  return lines.join("\n");
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

// Find the brand a name refers to: exact name or alias first, then a brand name found as whole words
// inside it ("Modular Lighting Instruments" -> "Modular"), or a name that starts a brand name
// ("Eagle" -> "Eagle Lighting"), preferring the longest brand name.
export function matchBrand(name: string, brands: Brand[]): Brand | null {
  const n = norm(name);
  if (!n) return null;
  const names = (b: Brand) => [b.name, ...b.aliases].map(norm).filter(Boolean);
  const exact = brands.find((b) => names(b).includes(n));
  if (exact) return exact;
  const padded = ` ${n} `;
  let best: { b: Brand; len: number } | null = null;
  for (const b of brands) {
    for (const x of names(b)) {
      if (x.length < 3) continue;
      if (padded.includes(` ${x} `) || ` ${x} `.startsWith(padded)) {
        if (!best || x.length > best.len) best = { b, len: x.length };
      }
    }
  }
  return best?.b ?? null;
}

const clean = (s: string) => s.trim();
export const parseAliases = (s: string) => Array.from(new Set(s.split(/[,;\n]/).map(clean).filter(Boolean)));

async function run<T>(q: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.code === "23505" ? "That name is already in the list." : error.message);
  return data as T;
}

export const saveSupplier = (s: Omit<Supplier, "id" | "main_contact_id"> & { id?: number; main_contact_id?: number | null }) => {
  const row: Record<string, unknown> = { name: clean(s.name), phone: clean(s.phone), email: clean(s.email), website: clean(s.website), notes: s.notes };
  if (s.main_contact_id !== undefined) row.main_contact_id = s.main_contact_id;
  return s.id ? run<Supplier>(supabase.from("dbs_suppliers").update(row).eq("id", s.id).select().single()) : run<Supplier>(supabase.from("dbs_suppliers").insert(row).select().single());
};

export const saveContact = (c: Omit<Contact, "id"> & { id?: number }) => {
  const row = { supplier_id: c.supplier_id, brand_id: c.brand_id, name: clean(c.name), title: clean(c.title), phone: clean(c.phone), email: clean(c.email), notes: c.notes };
  return c.id ? run<Contact>(supabase.from("dbs_contacts").update(row).eq("id", c.id).select().single()) : run<Contact>(supabase.from("dbs_contacts").insert(row).select().single());
};

export const saveBrand = (b: Omit<Brand, "id"> & { id?: number }) => {
  const row = { name: clean(b.name), aliases: b.aliases, supplier_id: b.supplier_id, main_contact_id: b.main_contact_id, website: clean(b.website), notes: b.notes };
  return b.id ? run<Brand>(supabase.from("dbs_brands").update(row).eq("id", b.id).select().single()) : run<Brand>(supabase.from("dbs_brands").insert(row).select().single());
};

export const setMainContact = (table: "dbs_brands" | "dbs_suppliers", id: number, contactId: number | null) =>
  run<unknown>(supabase.from(table).update({ main_contact_id: contactId }).eq("id", id).select());

// Your own preferred contact for a brand or supplier (null clears it, so the main contact is used).
export async function setPreference(target: { brand_id?: number; supplier_id?: number }, contactId: number | null) {
  const q = supabase.from("dbs_contact_prefs").delete();
  await run<unknown>((target.brand_id != null ? q.eq("brand_id", target.brand_id) : q.eq("supplier_id", target.supplier_id!)).select());
  if (contactId != null) await run<unknown>(supabase.from("dbs_contact_prefs").insert({ brand_id: target.brand_id ?? null, supplier_id: target.supplier_id ?? null, contact_id: contactId }).select());
}

export const removeRow = (table: "dbs_brands" | "dbs_suppliers" | "dbs_contacts", id: number) => run<unknown>(supabase.from(table).delete().eq("id", id).select());
