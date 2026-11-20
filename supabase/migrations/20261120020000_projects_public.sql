-- Public site: staff tick "Show on public site" on a project, and anyone
-- (signed in or not) can then see a short, safe summary of it on /public.
--
-- How the public gets in: the projects table stays admin-only (no policy for
-- anon at all). The only door for anonymous visitors is the function below,
-- which runs with its owner's rights, returns ONLY projects with
-- is_public = true, and ONLY the columns listed here. Funding, people,
-- Drive folders, map shapes, load model details and anything added to
-- projects later stay private unless someone adds them to this function.

alter table public.projects
  add column is_public boolean not null default false;

comment on column public.projects.is_public is
  'Shown on the public map (/public) when true. Only the columns returned by public.public_projects() are exposed.';

grant update (is_public) on public.projects to authenticated;

create or replace function public.public_projects()
returns table (
  id             uuid,
  name           text,
  description    text,
  latitude       double precision,
  longitude      double precision,
  stage          text,
  huc10_name     text,
  huc8_name      text,
  -- [{ "name": "Cover crop", "color": "#..." }], from the map shapes and load model entries
  practices      jsonb,
  sediment_tons  numeric,
  phosphorus_lb  numeric,
  nitrogen_lb    numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.description,
    p.latitude,
    p.longitude,
    p.stage,
    p.huc10_name,
    p.huc8_name,
    coalesce((
      select jsonb_agg(jsonb_build_object('name', t.name, 'color', t.color) order by t.sort_order, t.name)
      from public.practice_types t
      where t.id in (
        select f ->> 'practice'
        from jsonb_array_elements(coalesce(p.map_shapes -> 'features', '[]'::jsonb)) f
        union
        select e.practice_type from public.load_model_entries e where e.project_id = p.id
      )
    ), '[]'::jsonb),
    l.sediment_tons,
    l.phosphorus_lb,
    l.nitrogen_lb
  from public.projects p
  left join lateral (
    select sum(e.sediment_tons) as sediment_tons,
           sum(e.phosphorus_lb) as phosphorus_lb,
           sum(e.nitrogen_lb)   as nitrogen_lb
    from public.load_model_entries e
    where e.project_id = p.id
  ) l on true
  where p.is_public
    and p.latitude is not null
    and p.longitude is not null
  order by p.name;
$$;

comment on function public.public_projects() is
  'The public map''s only view of projects: safe columns of is_public projects. Callable without signing in.';

revoke all on function public.public_projects() from public;
grant execute on function public.public_projects() to anon, authenticated;
