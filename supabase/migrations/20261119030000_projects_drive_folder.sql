-- The project's Google Drive folder. Staff paste the folder's link; the app
-- stores just the folder ID. Later, cover images and map PNGs are saved there.

alter table public.projects add column drive_folder_id text
  check (drive_folder_id is null or drive_folder_id ~ '^[A-Za-z0-9_-]{10,}$');

grant update (drive_folder_id) on public.projects to authenticated;
