-- FAKE stages for the sample projects in fake_projects.sql, so the Projects
-- list's Stage column and filters have something to show. Run by hand in the
-- SQL Editor after the projects_stage migration. Never a migration.

update public.projects p set stage = s.stage
from (values
  ('Syracuse inlet shoreline stabilization — Reach 2',  'monitoring'),
  ('Tippecanoe Lake headwater wetland restoration',     'design'),
  ('Grassy Creek two-stage ditch — CR 500N',            'construction'),
  ('Webster Lake riparian buffer — Hollis farm',        'contracted'),
  ('Barbee Chain invasive control — bush honeysuckle',  'installed'),
  ('Beaver Dam no-till & cover crop cohort A',          'planning'),
  ('Little Tippecanoe wetland restoration — Cell 1',    'closed'),
  ('Grassy Creek bank stabilization — Reach 1',         'construction')
) as s(name, stage)
where p.name = s.name;
