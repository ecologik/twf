-- Made-up sample projects for trying out the Projects page.
-- Names come from the prototype; locations are rough points around
-- Kosciusko County, Indiana. None of this is real TWF data.
--
-- Run once in the Supabase SQL Editor after the projects migration, then
-- fake_project_descriptions.sql to fill in their descriptions.
-- To remove them later, run the delete at the bottom.

insert into public.projects (name, location, latitude, longitude) values
  ('Syracuse inlet shoreline stabilization — Reach 2', 'Syracuse–Wawasee, north shore of Syracuse Lake', 41.4275, -85.7480),
  ('Tippecanoe Lake headwater wetland restoration',    'Tippecanoe Lake, east inlet',                    41.3290, -85.7350),
  ('Grassy Creek two-stage ditch — CR 500N',           'Grassy Creek, along County Road 500 North',      41.3150, -85.7980),
  ('Webster Lake riparian buffer — Hollis farm',       'Webster Lake, south tributary',                  41.3120, -85.6800),
  ('Barbee Chain invasive control — bush honeysuckle', 'Barbee Chain of Lakes',                          41.2960, -85.7150),
  ('Beaver Dam no-till & cover crop cohort A',         'Beaver Dam Lake area, south of Silver Lake',     41.0880, -85.8950),
  ('Little Tippecanoe wetland restoration — Cell 1',   'Little Tippecanoe River, near Leesburg',         41.3320, -85.8500),
  ('Grassy Creek bank stabilization — Reach 1',        'Grassy Creek, upstream reach',                   41.3010, -85.8120);

-- Remove the samples:
-- delete from public.projects where name in (
--   'Syracuse inlet shoreline stabilization — Reach 2',
--   'Tippecanoe Lake headwater wetland restoration',
--   'Grassy Creek two-stage ditch — CR 500N',
--   'Webster Lake riparian buffer — Hollis farm',
--   'Barbee Chain invasive control — bush honeysuckle',
--   'Beaver Dam no-till & cover crop cohort A',
--   'Little Tippecanoe wetland restoration — Cell 1',
--   'Grassy Creek bank stabilization — Reach 1'
-- );
