# TWF Dashboard

Watershed Foundation (TWF) dashboard. React + Vite + TypeScript, Supabase, react-router.
Deployed as static files to twf.ecologik.net on Jon's GreenGeeks cPanel VPS (vps.ecologik.net), behind Sucuri. Repo: ecologik/twf.

## Commands
- `npm run dev` — dev server at http://localhost:5173
- `npm run build` — outputs `dist/`

## Env
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` go in `.env.local` (never committed; see `.env.example`).
- Only the anon key in frontend code. The service_role key never goes in React or any `VITE_` variable, only in Edge Function secrets.

## Supabase
- Project URL: https://jhowpquqdmdjwviqnjll.supabase.co (separate project from Reliance).
- Every table gets RLS plus at least one policy (RLS with zero policies silently returns empty results).
- Schema changes live as SQL files in `supabase/migrations/`.
- Edge Functions deploy with `npx -y supabase functions deploy <name>`.

## Routing
Client-side routes rely on `public/.htaccess` (SPA rewrite). Don't remove it. It also sends `Cache-Control: no-cache` for `index.html`, so Sucuri and browsers pick up each deploy. Hashed `assets/` files stay cacheable.

## Deploy
- Deploy with `.\deploy.ps1` (PowerShell, from Jon's PC). It refuses to run with uncommitted changes, since a local build ships the working tree, not git. Then it runs `git push`, builds, and uploads `dist/` to `~/public_html` over SSH with `~/.ssh/twf_deploy`. It never touches `.well-known` (AutoSSL) or `cgi-bin`, or `public_html`'s own permissions (750).
- `.github/workflows/deploy.yml` is a manual-only (`workflow_dispatch`) backup. The VPS firewall only allows SSH from Jon's IP, so GitHub's runners can't connect. Don't re-enable the push trigger unless that changes.

## Auth and roles
- Sign-in with Google or email + password (Supabase Auth, email must be confirmed). New users get a `profiles` row with role `pending` and see nothing until an admin picks `admin` (whole dashboard), `board` (Board section only) or `denied` on `/admin/users`.
- Nothing happens until the email is confirmed (Google sign-ins arrive confirmed). Then emails in `signup_approvers` become admin, and anyone else triggers a SendGrid email from the `notify-signup` Edge Function to approvers with `receives_emails`. Supabase Auth's own emails go through SendGrid SMTP. Deploy `notify-signup` with `--no-verify-jwt` (the database trigger calls it).
- Roles are enforced in RLS. Every new table's policies use `public.is_admin()` or `public.is_board_or_admin()`, never a bare `to authenticated` (pending users are authenticated). Frontend `RequireRole` is only for the UI.
- Setup steps (Google Cloud, Supabase, SendGrid): `docs/auth-setup.md`.
- Drive folder picker (optional `VITE_GOOGLE_*` vars, `drive.file` scope only): `docs/drive-picker-setup.md`.

## Maps
Leaflet via react-leaflet (`src/map/`), no API key: OpenStreetMap streets plus Esri World Imagery satellite. The Projects pages are lazy-loaded so the map library stays out of the main bundle. A project's Map tab draws shapes with Leaflet-Geoman and stores them as GeoJSON in `projects.map_shapes`; `src/map/exportPng.ts` turns the current view into a PNG Blob (tiles load with `crossOrigin` so the canvas can be exported). Each shape's `properties.practice` is an id from the `practice_types` table (admins edit it at `/admin/practices`, with a colour each); `/map` shows every project's shapes filtered by practice. Faint HUC watershed outlines (USGS WBD service, no key; HUC-10, or HUC-8 when zoomed out) are an overlay in `BaseLayers` (`src/map/HucLayer.tsx`). A project's HUC-10 (`projects.huc10`, names, generated `huc8`) is looked up from its pin in the browser (`src/map/huc.ts`) when the project is saved; Projects and `/map` filter by watershed. Fake sample projects live in `supabase/seed/fake_projects.sql` (run by hand, never a migration).

## Load model
A project's Load model tab imports results from an EPA Region 5 load-reduction workbook (.xlsm), parsed in the browser by `src/loadModel/` (its own small zip/XML reader on `fflate`; never runs formulas or macros). It reads the values Excel saved, at fixed cell addresses checked against each tab's labels, and saves one `load_model_entries` row per BMP. Practice and life span aren't in the workbook: staff pick them from `src/loadModel/practices.ts` (state guidance list, copied from the prototype). The model itself is not built (TWF's contract dropped it). Workbook sources are pluggable (`src/loadModel/sources.ts`) so Drive can be added later. Each entry also carries a map `practice_type` (suggested from the practice); the Map section shows a banner with sediment/P/N totals for the practice types shown, totals per type in the filter list, and per-project totals on pins.
