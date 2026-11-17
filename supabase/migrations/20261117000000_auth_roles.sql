-- Google sign-in with approval.
--
-- Every new sign-in gets a row in public.profiles with role 'pending'.
-- Pending (and denied) users can read only their own profile and nothing else.
-- An admin sets the role to 'admin' (whole dashboard) or 'board' (Board
-- section only). The roles are enforced here with RLS, not only in the UI.
--
-- People listed in public.signup_approvers (Lyn, Mariah, ...) become admins
-- automatically on their first sign-in. The ones with receives_emails = true
-- get an email from the notify-signup Edge Function whenever someone new
-- signs up.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.signup_approvers (
  email           text primary key check (email = lower(email)),
  receives_emails boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.signup_approvers is
  'Emails that become admin on first sign-in. receives_emails = true means they are emailed about new sign-ups. Edit with SQL in the Supabase dashboard.';

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  role        text not null default 'pending'
              check (role in ('pending', 'admin', 'board', 'denied')),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- Role helpers. Use these in the RLS policies of every future table:
--   admin-only data:        using (public.is_admin())
--   Board-section data:     using (public.is_board_or_admin())
-- Never use a bare "to authenticated" policy: pending users are authenticated.
-- ---------------------------------------------------------------------------

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_board_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'board'))
$$;

revoke execute on function public.current_app_role()  from public, anon;
revoke execute on function public.is_admin()          from public, anon;
revoke execute on function public.is_board_or_admin() from public, anon;
grant  execute on function public.current_app_role()  to authenticated;
grant  execute on function public.is_admin()          to authenticated;
grant  execute on function public.is_board_or_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- New user -> profile row (pending, or admin if listed in signup_approvers),
-- then ask the notify-signup Edge Function to email the approvers.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_role  text := 'pending';
begin
  if exists (select 1 from public.signup_approvers where email = v_email) then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role, approved_at)
  values (
    new.id,
    v_email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    v_role,
    case when v_role = 'admin' then now() end
  );

  if v_role = 'pending' then
    -- Fire and forget. The function itself checks that this user really is
    -- pending and not yet notified, so the call needs no secret.
    perform net.http_post(
      url     := 'https://jhowpquqdmdjwviqnjll.supabase.co/functions/v1/notify-signup',
      body    := jsonb_build_object('user_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role changes: record who approved, and stop an admin changing their own
-- role (so nobody locks themselves out by accident).
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and auth.uid() = old.id then
      raise exception 'You cannot change your own role. Ask another admin.';
    end if;
    if new.role in ('admin', 'board') then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.signup_approvers enable row level security;

-- Everyone signed in can read their own profile (that's how the app knows
-- whether to show the pending screen). Admins can read everyone.
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles: admins read all"
  on public.profiles for select to authenticated
  using (public.is_admin());

-- Only admins can update, and (via the column grant below) only the role.
create policy "profiles: admins update"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No insert/delete policies: rows come from the trigger, and removal goes
-- through deleting the auth user in the Supabase dashboard.

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (role) on public.profiles to authenticated;

create policy "signup_approvers: admins read"
  on public.signup_approvers for select to authenticated
  using (public.is_admin());

revoke all on public.signup_approvers from anon, authenticated;
grant select on public.signup_approvers to authenticated;
