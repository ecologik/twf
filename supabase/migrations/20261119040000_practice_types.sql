-- Practice types: what kind of work a shape on a project's map shows
-- (cover crop, grassed waterway, two-stage ditch...). Each map shape stores
-- the type's id in its GeoJSON properties as "practice", and the Map section
-- filters every project's shapes by it. Admins can add, rename and recolour
-- types on /admin/practices.

create table public.practice_types (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name        text not null unique check (length(btrim(name)) > 0),
  color       text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

comment on table public.practice_types is
  'Kinds of conservation practice a map shape can be tagged with. id is stored in projects.map_shapes features (properties.practice).';

alter table public.practice_types enable row level security;

create policy "practice_types: board and admins read"
  on public.practice_types for select to authenticated
  using (public.is_board_or_admin());

create policy "practice_types: admins insert"
  on public.practice_types for insert to authenticated
  with check (public.is_admin());

create policy "practice_types: admins update"
  on public.practice_types for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "practice_types: admins delete"
  on public.practice_types for delete to authenticated
  using (public.is_admin());

revoke all on public.practice_types from anon, authenticated;
grant select, insert, delete on public.practice_types to authenticated;
grant update (name, color, sort_order) on public.practice_types to authenticated;

-- Starting list (colours from the prototype's map legend). Not sample data:
-- these are the real choices staff pick from, and admins can change them.
insert into public.practice_types (id, name, color, sort_order) values
  ('cover-crop',       'Cover crop',                 '#e34948', 10),
  ('no-till',          'No-till',                    '#eda100', 20),
  ('grassed-waterway', 'Grassed waterway',           '#00a3b4', 30),
  ('filter-strip',     'Filter strip',               '#a35bd0', 40),
  ('riparian-buffer',  'Riparian buffer',            '#e87ba4', 50),
  ('two-stage-ditch',  'Two-stage ditch',            '#008300', 60),
  ('streambank',       'Streambank / shoreline',     '#2a78d6', 70),
  ('wetland',          'Wetland restoration',        '#eb6834', 80),
  ('invasive-control', 'Invasive species control',   '#1baf7a', 90),
  ('feedlot',          'Feedlot runoff control',     '#4a3aa7', 100),
  ('other',            'Other / reference',          '#52514e', 1000);
