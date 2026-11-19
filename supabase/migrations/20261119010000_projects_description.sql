-- Project description: a plain-language paragraph, written once. It feeds the
-- report package narrative and the public project page.

alter table public.projects add column description text;

-- Admins may edit it (column-level grant, like the other editable fields).
grant update (description) on public.projects to authenticated;
