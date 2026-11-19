-- Load model entries: one row per BMP on a project's Load model tab.
--
-- Rows are imported from an EPA Region 5 load-reduction workbook (.xlsm).
-- The dashboard reads the results the workbook already calculated; it does not
-- run the model. sheet_kind says which workbook tab the row came from.
-- practice and life_years come from the state guidance list in the app
-- (src/loadModel/practices.ts), since the workbook doesn't record them.
--
-- Units: sediment in tons/yr; phosphorus, nitrogen and BOD in lb/yr. A null
-- means the workbook has no figure for it (e.g. sediment on the Feedlots tab).

create table public.load_model_entries (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  name           text not null check (length(btrim(name)) > 0),
  sheet_kind     text not null check (sheet_kind in ('gully', 'bank', 'ag', 'feedlot', 'urban_rate', 'urban_emc', 'easement')),
  practice       text,
  life_years     numeric check (life_years > 0),
  sediment_tons  numeric,
  phosphorus_lb  numeric,
  nitrogen_lb    numeric,
  bod_lb         numeric,
  -- Key inputs for display, as [label, value] pairs.
  details        jsonb not null default '[]'::jsonb check (jsonb_typeof(details) = 'array'),
  -- The same inputs as raw values, for a calculator later.
  inputs         jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  source_file    text,
  source_sheet   text,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.load_model_entries is
  'Load reductions per BMP on a project, read from a Region 5 workbook. Sediment ton/yr; P, N, BOD lb/yr.';

create index load_model_entries_project_idx on public.load_model_entries (project_id, created_at);

create trigger load_model_entries_touch_updated_at
  before update on public.load_model_entries
  for each row execute function public.touch_updated_at();

-- RLS: admins only, like projects. Never a bare "to authenticated".
alter table public.load_model_entries enable row level security;

create policy "load_model_entries: admins read"
  on public.load_model_entries for select to authenticated
  using (public.is_admin());

create policy "load_model_entries: admins insert"
  on public.load_model_entries for insert to authenticated
  with check (public.is_admin());

create policy "load_model_entries: admins update"
  on public.load_model_entries for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "load_model_entries: admins delete"
  on public.load_model_entries for delete to authenticated
  using (public.is_admin());

revoke all on public.load_model_entries from anon, authenticated;
grant select, insert, delete on public.load_model_entries to authenticated;
grant update (name, practice, life_years) on public.load_model_entries to authenticated;
