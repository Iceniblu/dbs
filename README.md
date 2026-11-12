# DBS

Work tools for DBS Consulting: the **datasheet generator** and the **supplier database**.
Next.js (App Router) on Vercel, Supabase for sign-in and data. Split out of the household apps (sasbox001) in Nov 2026.

**Live site:** the Vercel project **`dbs-7xvc`** (https://dbs-7xvc.vercel.app) is the active one going forward.
Environment variables and domains belong there. The older Vercel project named `dbs` is not the live site.

| Route | What |
|---|---|
| `/` | Tool cards |
| `/datasheet` | Product page, PDF or specs → DBS schedule datasheet (.docx). See `docs/dbs-datasheet.md` |
| `/suppliers` | Brands, suppliers and their contacts |
| `/join` | New people sign up with the week's join code. See `docs/join-codes.md` |
| `/admin` | Simon only: the join code, and who has DBS access |
| `/profile` | Your name and password |

## How changes go live
- **Code:** push to `main` → Vercel deploys (the live project is `dbs-7xvc`).
- **Database:** add a new numbered file in `supabase/migrations/`; on push to `main` the *Apply database migrations*
  workflow runs it once (`scripts/migrate.sh`, needs the `DATABASE_URL` repo secret).

## Environment (Vercel project `dbs-7xvc` → Settings → Environment Variables; see `.env.example`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY` (server only), optional `DBS_DATASHEET_MODEL`.
