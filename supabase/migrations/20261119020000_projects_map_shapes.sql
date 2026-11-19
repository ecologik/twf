-- Shapes drawn on a project's Map tab (areas, lines and points, each with an
-- optional label), stored as a GeoJSON FeatureCollection so they can be
-- reopened and edited. The PNG for reports is made from these.

alter table public.projects add column map_shapes jsonb
  check (map_shapes is null or map_shapes ->> 'type' = 'FeatureCollection');

grant update (map_shapes) on public.projects to authenticated;
