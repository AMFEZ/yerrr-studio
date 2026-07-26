-- YERRR Studio
-- Alpha 5.20B1 — Canonical public-entry settings foundation
-- Safe to rerun.

begin;

create table if not exists public.entry_public_settings (
  user_id uuid not null default auth.uid(),
  entry_id text not null,
  visibility text not null default 'private',
  is_featured boolean not null default false,
  display_order integer,
  public_title text not null default '',
  public_summary text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_id),
  constraint entry_public_settings_visibility_check
    check (lower(visibility) in ('public', 'private')),
  constraint entry_public_settings_display_order_check
    check (display_order is null or display_order >= 0)
);

-- Upgrade an earlier partial table without deleting data.
alter table public.entry_public_settings
  add column if not exists user_id uuid default auth.uid(),
  add column if not exists entry_id text,
  add column if not exists visibility text default 'private',
  add column if not exists is_featured boolean default false,
  add column if not exists display_order integer,
  add column if not exists public_title text default '',
  add column if not exists public_summary text default '',
  add column if not exists published_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();


-- Replace older visibility checks with the canonical lowercase contract.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_record.conname
    from pg_constraint as constraint_record
    join pg_class as table_record
      on table_record.oid = constraint_record.conrelid
    join pg_namespace as namespace_record
      on namespace_record.oid = table_record.relnamespace
    where namespace_record.nspname = 'public'
      and table_record.relname = 'entry_public_settings'
      and constraint_record.contype = 'c'
      and pg_get_constraintdef(constraint_record.oid) ilike '%visibility%'
  loop
    execute format(
      'alter table public.entry_public_settings drop constraint %I',
      constraint_row.conname
    );
  end loop;
end
$$;

update public.entry_public_settings
set
  visibility = case
    when lower(coalesce(visibility, 'private')) = 'public' then 'public'
    else 'private'
  end,
  is_featured = coalesce(is_featured, false),
  public_title = coalesce(public_title, ''),
  public_summary = coalesce(public_summary, ''),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  visibility is null
  or lower(visibility) not in ('public', 'private')
  or is_featured is null
  or public_title is null
  or public_summary is null
  or created_at is null
  or updated_at is null;

alter table public.entry_public_settings
  add constraint entry_public_settings_visibility_check
  check (lower(visibility) in ('public', 'private'));

create unique index if not exists entry_public_settings_user_entry_uidx
  on public.entry_public_settings (user_id, entry_id);

-- Seed settings from the existing entry-level visibility and featured fields.
insert into public.entry_public_settings (
  user_id,
  entry_id,
  visibility,
  is_featured,
  display_order,
  public_title,
  public_summary
)
select
  entry_row.user_id,
  entry_row.id::text,
  case
    when lower(coalesce(entry_row.visibility, 'private')) = 'public' then 'public'
    else 'private'
  end,
  coalesce(entry_row.featured, false),
  null,
  '',
  ''
from public.entries as entry_row
where entry_row.user_id is not null
on conflict (user_id, entry_id) do nothing;

create index if not exists entry_public_settings_visibility_idx
  on public.entry_public_settings (user_id, visibility);

create index if not exists entry_public_settings_featured_idx
  on public.entry_public_settings (user_id, is_featured, display_order);

create or replace function public.set_entry_public_settings_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists yerrr_entry_public_settings_updated_at
  on public.entry_public_settings;

create trigger yerrr_entry_public_settings_updated_at
before update on public.entry_public_settings
for each row
execute function public.set_entry_public_settings_updated_at();

alter table public.entry_public_settings enable row level security;

drop policy if exists "Users can read their public entry settings"
  on public.entry_public_settings;
create policy "Users can read their public entry settings"
  on public.entry_public_settings
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert their public entry settings"
  on public.entry_public_settings;
create policy "Users can insert their public entry settings"
  on public.entry_public_settings
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their public entry settings"
  on public.entry_public_settings;
create policy "Users can update their public entry settings"
  on public.entry_public_settings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their public entry settings"
  on public.entry_public_settings;
create policy "Users can delete their public entry settings"
  on public.entry_public_settings
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete
  on public.entry_public_settings
  to authenticated;

comment on table public.entry_public_settings is
  'Per-user public launch metadata for YERRR lexicon entries.';

commit;

notify pgrst, 'reload schema';
