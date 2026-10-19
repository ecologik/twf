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
- Separate project from Reliance.
- Every table gets RLS plus at least one policy (RLS with zero policies silently returns empty results).
- Schema changes live as SQL files in `supabase/migrations/`.
- Edge Functions deploy with `npx -y supabase functions deploy <name>`.

## Routing
Client-side routes rely on `public/.htaccess` (SPA rewrite). Don't remove it.

## Deploy
- `.github/workflows/deploy.yml` builds on GitHub and rsyncs `dist/` to `~/public_html`.
- The push trigger is off (manual `workflow_dispatch` only) until the server and secrets are set up.
- If deploying from a local build instead, commit first: a local build ships the working tree, not git.
