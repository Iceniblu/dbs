# Notes for Claude

This repo is the DBS work-tools app (see README.md). It is separate from Simon's household apps on purpose:
don't add household features here, and don't reach into other repos or Supabase/Vercel projects.

## Working here
- Ship changes on a branch and open a PR; Simon merges (or asks you to). Pushing to `main` deploys.
- Database changes: a new `supabase/migrations/NNNN_name.sql`, idempotent where practical (`if not exists`,
  `create or replace`, `drop policy if exists`). Never edit a migration that has already run.
- Every table gets RLS. Tool data uses `has_app_access('dbs')` (admin, or a member ticked on /admin).
  Per-person data also checks `user_id = auth.uid()`.
- New tool: `app/<slug>/page.tsx` wrapped in `<AuthGate wide app="dbs">` and `<DbsShell>`, plus a card in `app/page.tsx`.
  Styles go in `app/dbs.css`; the DBS look (navy band, teal rule, hatch footer) lives in `components/dbs/Shell.tsx`.
- Server routes that use keys go under `app/api/dbs/*` and check `getUser` + `hasAppAccess(req, "dbs")` (`lib/server.ts`).
  Fetching outside URLs goes through `lib/safefetch.ts`.
- Run `npx tsc --noEmit` and `npx next build` before pushing.

## Never
- Put keys, tokens or passwords in code, commits, chat or messages to other sessions. Simon adds them in Vercel / GitHub secrets.
- Commit real supplier contact details (phones, emails) as seed data. They live only in the database.

## Current state (Nov 2026)
- Datasheet generator: import from URL/PDF/text with Claude, check fields, preview, download .docx. Supplier row from the supplier database.
- Suppliers: brands ↔ suppliers; contacts on both; main contact per brand/supplier (Edit view); each person's
  preferred contact. Datasheets only use supplier contacts. Logic in `lib/dbs-suppliers.ts`.
- Sign-in: email + password or email link; self sign-up with the weekly join code; access ticked per person on /admin.
