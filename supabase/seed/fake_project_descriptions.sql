-- Made-up descriptions for the sample projects in fake_projects.sql.
-- Run in the Supabase SQL Editor after fake_projects.sql and the
-- projects_description migration. None of this is real TWF data.

update public.projects as p set description = d.description
from (values
  ('Syracuse inlet shoreline stabilization — Reach 2',
   'Two thousand one hundred feet of eroding shoreline on the Syracuse inlet, stabilized with toe-wood revetment and three bendway weirs rather than rock alone, so the bank rebuilds itself as the willows take. The reach was losing an estimated half a foot a year into the channel directly upstream of the lake. Year-one photo points and a cross-section at station 4+50 are complete; the landowner has kept cattle fenced off the new plantings.'),
  ('Tippecanoe Lake headwater wetland restoration',
   'Eleven acres of drained cropland at the east inlet are being returned to wetland by breaking two field tiles and shaping shallow pools. Water that used to rush straight into the lake will now sit and settle, dropping sediment and phosphorus before it reaches open water. Native seed goes in next spring, and the farmer keeps haying rights on the upland edge.'),
  ('Grassy Creek two-stage ditch — CR 500N',
   'Four thousand feet of ditch along County Road 500 North is being rebuilt with benches on both sides, so high water spreads out and slows down instead of cutting the banks. The benches grow grass that traps soil and takes up nitrogen. The drainage board approved the design, and the ditch still drains the surrounding fields as well as it did before.'),
  ('Webster Lake riparian buffer — Hollis farm',
   'A strip of trees, shrubs and native grasses fifty feet wide now runs along a half mile of the south tributary to Webster Lake. It catches runoff from the fields before it reaches the water and shades the stream to keep it cool. The landowner chose the plant list with us and mows a walking path along the outside edge.'),
  ('Barbee Chain invasive control — bush honeysuckle',
   'Bush honeysuckle had taken over the woods along the channels between the Barbee lakes, shading out the plants that hold the banks in place. Crews and volunteers cut and treated about nine acres over two winters. Native shrubs and sedges are being planted in the openings so the honeysuckle does not come straight back.'),
  ('Beaver Dam no-till & cover crop cohort A',
   'Six farms south of Silver Lake signed on to plant cereal rye after harvest and skip fall tillage for three seasons. Keeping roots in the ground over winter holds the soil in place and cuts the mud that washes toward Beaver Dam Lake in spring. The group meets twice a year to compare yields and share what worked.'),
  ('Little Tippecanoe wetland restoration — Cell 1',
   'The first of three planned wetland cells near Leesburg restores about six acres of floodplain that the Little Tippecanoe can reach again in high water. Low berms hold water into early summer, giving sediment time to settle and wildlife a place to feed. Cells 2 and 3 depend on how this one performs over two seasons.'),
  ('Grassy Creek bank stabilization — Reach 1',
   'The upstream reach of Grassy Creek was cutting into a farm field at three sharp bends. The banks are being reshaped to a gentler slope and anchored with root wads and live willow stakes. The goal is a bank that holds without hard armor and gives fish cover along the edge.')
) as d(name, description)
where p.name = d.name;
