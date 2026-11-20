-- Where each project is in its life, from planning to close-out (the
-- prototype's seven stages). New projects start in Planning. The ids match
-- src/pages/projects/stages.ts.

alter table public.projects
  add column stage text not null default 'planning'
    check (stage in ('planning', 'design', 'contracted', 'construction', 'installed', 'monitoring', 'closed'));

create index projects_stage_idx on public.projects (stage);

grant update (stage) on public.projects to authenticated;
