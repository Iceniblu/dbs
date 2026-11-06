#!/usr/bin/env bash
# Applies any new files in supabase/migrations/ (in name order) to the database in $DATABASE_URL.
# Applied files are recorded in internal.schema_migrations, so each runs once, inside a transaction.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is not set}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists internal;
create table if not exists internal.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
SQL

shopt -s nullglob
applied_any=0
for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  done_already=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "select 1 from internal.schema_migrations where name = '$name'")
  if [ -n "$done_already" ]; then
    echo "skip   $name"
    continue
  fi
  echo "apply  $name"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q --single-transaction \
    -f "$f" \
    -c "insert into internal.schema_migrations (name) values ('$name')"
  applied_any=1
done
[ "$applied_any" = 1 ] && echo "Done." || echo "Nothing new to apply."
