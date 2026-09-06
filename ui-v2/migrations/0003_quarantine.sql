-- The Quarantine Cell.
--
-- The Oracle's law: "Any model fabricating facts triggers immediate quarantine."
-- This is where that lands. One row per claim a model asserted that its own
-- evidence did not support.
--
-- The row keeps the evidence that was actually retrieved alongside the claim,
-- because a quarantine record without the context it failed against is just
-- another unsourced assertion — the exact thing being recorded.

create table if not exists quarantine_claims (
  id serial primary key,
  user_id text not null,
  -- The specific sentence or number that was not supported.
  claim text not null,
  -- Which model said it, where it was standing, and what it was asked.
  model text not null default 'unknown',
  room text not null default 'unknown',
  prompt text,
  -- What the retrieval actually returned. May be empty — that is itself the
  -- finding, and is recorded as such rather than left null and ambiguous.
  evidence text not null default '',
  -- How this was caught: 'operator' (you saw it), 'no_evidence' (answered with
  -- an empty retrieval set), or 'hhem' (a consistency score below threshold).
  detected_by text not null default 'operator',
  -- 0..1 where a scorer produced one; null when a human made the call.
  consistency_score real,
  note text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create index if not exists quarantine_claims_user_id_idx on quarantine_claims (user_id);
create index if not exists quarantine_claims_status_idx on quarantine_claims (status);
