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

## Maps
Leaflet via react-leaflet (`src/map/`), no API key: OpenStreetMap streets plus Esri World Imagery satellite. The Projects pages are lazy-loaded so the map library stays out of the main bundle. Fake sample projects live in `supabase/seed/fake_projects.sql` (run by hand, never a migration).
