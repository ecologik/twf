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
- `.github/workflows/deploy.yml` builds on GitHub and rsyncs `dist/` to `~/public_html`.
- Every push to `main` deploys (also runnable by hand via `workflow_dispatch`). Secrets live in the GitHub repo settings.
- rsync excludes `.well-known` (AutoSSL) and `cgi-bin` so deploys don't delete them.
- Local deploy (currently the working route, since the VPS firewall blocks GitHub's runners on SSH): `.\deploy.ps1` (PowerShell) runs `git push`, then builds and uploads `dist/` over SSH with `~/.ssh/twf_deploy`. It refuses to run with uncommitted changes, since a local build ships the working tree, not git. It also never touches `.well-known` or `cgi-bin`.
