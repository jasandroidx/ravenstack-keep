---
name: keep-migrations
description: >
  Write, repair or review SQL migrations for Ravenstack Keep. Use when adding a
  table, column or index, when a schema change must reach Neon and the box, when
  PGlite preview and production disagree, or when a migration has already
  shipped and needs correcting.
metadata:
  short-description: "Safe migrations for the two-runner Keep schema"
---

# Keep migrations

`ui-v2/migrations/*.sql` is the single schema source. It is applied by **two**
runners that must agree in effect:

| Runner            | File                          | Trigger                                        | Ordering                |
| ----------------- | ----------------------------- | ---------------------------------------------- | ----------------------- |
| node-postgres     | `ui-v2/scripts/migrate.mjs`   | `npm run build` (Vercel) — **not** `build:box` | `readdir().sort()`      |
| PGlite (embedded) | `ui-v2/src/lib/db.ts` (~L130) | first query when `DATABASE_URL` is unset       | `localeCompare` on path |

Both open a transaction per file, run the SQL, and insert the filename into
`_migrations` inside that same transaction. **The filename is the migration's
identity.** It is the primary key. It is not a label.

## Rules

1. **Filename:** `NNNN_snake_case.sql`, zero-padded to four, prefix globally
   unique. Two files sharing a prefix is the bug this repo already shipped:
   `0003_gallery.sql` and `0003_quarantine.sql`.
2. **Never rename, never delete, never edit a file that has shipped.** A rename
   re-applies it; an edit diverges silently from every database that already ran
   it (its `_migrations` row says "done"). Fix forward with a new number.
3. **Additive only.** `create table if not exists`, `alter table … add column if
not exists`, `create index if not exists` **with a new index name**. No `drop`,
   no type narrowing, no rename without a backfill migration beside it.
4. **One concern per file.** A gallery table and a quarantine table are two files.
5. **`if not exists` is not a substitute for a correct prefix.** Two files that
   create the same table with different columns is worse than an error: whichever
   sorts first wins and the other becomes an invisible no-op. That is exactly the
   current `0003_gallery` / `0004_gallery` situation — `0003` has
   `thumbnail_url` + `updated_at`, `0004` does not, and
   `gallery_portraits_slot_idx` is defined twice over different columns.
6. **PGlite parity:** no `DO $$ … $$`, no `\` meta-commands, no extensions, no
   `create type`. Prefer `text` over `varchar(n)`, keep `timestamptz`, keep
   `serial` vs `integer` consistent with the surrounding tables.
7. **Record intent in a comment.** One or two lines at the head saying what the
   table is for and what it is _not_. The existing quarantine migration is the
   model to copy.

## Every new migration must pass

- [ ] Prefix unique across the directory (`ls migrations | cut -c1-4 | sort | uniq -d` is empty)
- [ ] Additive; no destructive statement
- [ ] Head comment: purpose + why now
- [ ] Parses under PGlite (`npm run db:check`)
- [ ] Applied once to a scratch DB and re-run is a clean no-op
- [ ] Any index has a name that exists nowhere else
- [ ] PR body says whether the box needs `npm run db:migrate`

## Repair pattern (drift already shipped)

```
0005_gallery_reconcile.sql

-- Reconciler for the two divergent 0003/0004 gallery definitions.
-- Adds what some databases are missing; changes nothing that already exists.

alter table gallery_portraits add column if not exists thumbnail_url text;
alter table gallery_portraits add column if not exists updated_at timestamptz not null default now();
create index if not exists gallery_portraits_user_slot_idx on gallery_portraits (user_id, slot_number);
```

- New index name, never a redefinition of an existing one.
- Add a comment at the head of the old file pointing forward; comments do not
  change semantics and do not require re-applying.
- Never "clean up" the old file.

## The production gap

`build:box` (`NITRO_PRESET=node-server vite build`) does **not** run
`db:migrate`. The box therefore holds whatever schema was applied by hand.
Any PR that adds schema must say so explicitly:

```bash
cd /root/ravenstack-keep/ui-v2 && DATABASE_URL=… npm run db:migrate
```

## Verify

```bash
cd ui-v2
node --experimental-strip-types --no-warnings scripts/db-check.mjs   # once added
npm run typecheck && npm test && npm run build:box
```
