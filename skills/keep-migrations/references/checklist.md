# Migration pre-merge checklist

Copy into the PR body and tick every line.

## Identity

- [ ] File is `ui-v2/migrations/NNNN_snake_case.sql`
- [ ] `NNNN` is the next free number: `ls ui-v2/migrations | cut -c1-4 | sort | tail -1`
- [ ] No other file shares this prefix: `ls ui-v2/migrations | cut -c1-4 | sort | uniq -d` prints nothing
- [ ] This file has never shipped under another name (renames re-apply)

## Content

- [ ] Additive only — no `drop`, no narrowing, no destructive `alter`
- [ ] `create table if not exists` / `add column if not exists` used where a re-run is legitimate
- [ ] Every index has a unique name across the whole directory
- [ ] Head comment states purpose and why now
- [ ] PGlite-safe: no `DO $$`, no `\` commands, no extensions, no `create type`
- [ ] Column types match neighbouring tables (`timestamptz`, `text`, `serial`)

## Verification

- [ ] Applied to a scratch database once (clean) and again (no-op)
- [ ] `npm run db:check` passes (PGlite apply of the whole directory)
- [ ] `npm run typecheck`, `npm test`, `npm run build:box` pass
- [ ] Any server function reading the new column has a test for the missing-column
      path (fresh DB / old DB) — never a crash, never invented data

## Rollout

- [ ] PR body says whether the box needs `npm run db:migrate` (it does for anything schema-shaped, since `build:box` does not migrate)
- [ ] PR body lists the exact column(s) added, for the operator to verify with
      `\d <table>` or `select column_name from information_schema.columns where table_name = '<table>'`
- [ ] No secrets, hosts, tokens or connection strings in the file, the PR, or the logs
