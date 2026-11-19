-- Projects: the first real data table.
--
-- Deliberately minimal for now (name, a location description and the point
-- the project is based out of). More fields come once TWF confirms what they
-- track. Staff set latitude/longitude by clicking a map in the dashboard.
--
-- Admin only for now. The Board section will get its own read path (without
-- landowner names) when it is built.

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  location    text,
  latitude    double precision check (latitude  between -90  and 90),
  longitude   double precision check (longitude between -180 and 180),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Both or neither: a pin needs both coordinates.
  constraint projects_lat_lng_together check ((latitude is null) = (longitude is null))
);

comment on table public.projects is
  'TWF projects. latitude/longitude (WGS84) is where the project is based, picked on a map.';

create index projects_name_idx on public.projects (lower(name));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: admins only. Never a bare "to authenticated" (pending users are
-- authenticated too).
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;

create policy "projects: admins read"
  on public.projects for select to authenticated
  using (public.is_admin());

create policy "projects: admins insert"
  on public.projects for insert to authenticated
  with check (public.is_admin());

create policy "projects: admins update"
  on public.projects for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "projects: admins delete"
  on public.projects for delete to authenticated
  using (public.is_admin());

revoke all on public.projects from anon, authenticated;
grant select, insert, delete on public.projects to authenticated;
grant update (name, location, latitude, longitude) on public.projects to authenticated;
