-- The Grand Gallery.
--
-- commissionPortrait has always inserted into this table; the migration that
-- should have created it never left AI Studio, so the insert has been writing
-- to nothing. Columns and types are taken from that insert statement.

create table if not exists gallery_portraits (
  id serial primary key,
  user_id text not null,
  slot_number integer not null,
  subject_name text not null,
  arcane_title text not null,
  custom_modifier text,
  trivia text,
  -- Either a data: URL from Imagen, or the literal 'procedural' when the
  -- image step produced nothing. Stored as sent, never blanked.
  image_url text not null,
  lore text not null,
  created_at timestamptz not null default now()
);
create index if not exists gallery_portraits_user_id_idx on gallery_portraits (user_id);
create index if not exists gallery_portraits_slot_idx on gallery_portraits (user_id, slot_number);
