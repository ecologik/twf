-- The HUC-10 watershed each project's pin falls in, looked up in the browser
-- from the USGS Watershed Boundary Dataset (hydro.nationalmap.gov) whenever
-- the pin is set. Used to filter projects by watershed.
--
-- huc10 is the 10-digit code; its first 8 digits are the HUC-8 subbasin it
-- belongs to, kept as a generated column so both levels can be filtered.
-- The names are stored as the service gave them, so lists don't need to ask
-- USGS again.

alter table public.projects
  add column huc10      text check (huc10 is null or huc10 ~ '^[0-9]{10}$'),
  add column huc10_name text,
  add column huc8_name  text,
  add column huc8       text generated always as (left(huc10, 8)) stored;

comment on column public.projects.huc10 is
  'HUC-10 watershed (USGS WBD) containing the project pin. Looked up by the dashboard.';

create index projects_huc10_idx on public.projects (huc10);
create index projects_huc8_idx on public.projects (huc8);

grant update (huc10, huc10_name, huc8_name) on public.projects to authenticated;
