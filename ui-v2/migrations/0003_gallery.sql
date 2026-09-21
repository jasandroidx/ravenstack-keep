-- The Grand Gallery portraits and chronicles
create table if not exists gallery_portraits (
  id serial primary key,
  user_id text not null,
  slot_number integer not null,
  subject_name text not null,
  arcane_title text not null,
  custom_modifier text,
  trivia text,
  image_url text not null,
  thumbnail_url text,
  lore text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gallery_portraits_user_id_idx on gallery_portraits (user_id);
create index if not exists gallery_portraits_slot_idx on gallery_portraits (slot_number);
