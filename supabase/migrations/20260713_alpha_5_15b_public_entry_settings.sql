-- YERRR Studio
-- Alpha 5.15B — Public Publishing Controls
--
-- Adds isolated public publishing metadata without changing
-- the existing entries or meanings table structure.
--
-- Safe to rerun.

begin;

do $$
begin
  if to_regclass('public.entries') is null then
    raise exception
      'Alpha 5.15B stopped: public.entries does not exist.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Public publishing metadata
-- ---------------------------------------------------------------------------

create table if not exists public.public_entry_settings (
  entry_id text primary key,

  visibility text not null default 'private'
    check (
      visibility in (
        'private',
        'public'
      )
    ),

  is_featured boolean not null default false,

  display_order integer null
    check (
      display_order is null
      or display_order >= 0
    ),

  public_title text not null default '',
  public_summary text not null default '',

  published_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.public_entry_settings is
  'YERRR Studio public visibility and presentation settings.';

comment on column public.public_entry_settings.entry_id is
  'Text representation of public.entries.id.';

comment on column public.public_entry_settings.visibility is
  'Controls whether an entry remains private or may be returned by the future public application.';

comment on column public.public_entry_settings.is_featured is
  'Marks an entry as eligible for featured-entry placement.';

comment on column public.public_entry_settings.display_order is
  'Optional manual ordering value for public presentation.';

comment on column public.public_entry_settings.public_title is
  'Optional public-facing title override. Empty means use entries.word.';

comment on column public.public_entry_settings.public_summary is
  'Optional short public-facing summary.';

create index if not exists
  public_entry_settings_visibility_idx
on public.public_entry_settings (
  visibility
);

create index if not exists
  public_entry_settings_featured_idx
on public.public_entry_settings (
  is_featured
)
where is_featured = true;

create index if not exists
  public_entry_settings_display_order_idx
on public.public_entry_settings (
  display_order
)
where display_order is not null;

-- ---------------------------------------------------------------------------
-- 2. Timestamp and publishing behavior
-- ---------------------------------------------------------------------------

create or replace function
  public.set_public_entry_settings_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.visibility = 'public' then
      new.published_at :=
        coalesce(
          new.published_at,
          now()
        );
    else
      new.published_at := null;
    end if;

    return new;
  end if;

  if new.visibility = 'public'
     and old.visibility is distinct from 'public' then
    new.published_at :=
      coalesce(
        new.published_at,
        now()
      );
  end if;

  if new.visibility <> 'public' then
    new.published_at := null;
  end if;

  return new;
end;
$$;

revoke all
on function
  public.set_public_entry_settings_metadata()
from public;

drop trigger if exists
  yerrr_set_public_entry_settings_metadata
on public.public_entry_settings;

create trigger
  yerrr_set_public_entry_settings_metadata
before insert or update
on public.public_entry_settings
for each row
execute function
  public.set_public_entry_settings_metadata();

-- ---------------------------------------------------------------------------
-- 3. Keep settings synchronized with entry creation/deletion
-- ---------------------------------------------------------------------------

create or replace function
  public.sync_public_entry_settings_from_entries()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.public_entry_settings
    where entry_id = old.id::text;

    return old;
  end if;

  insert into public.public_entry_settings (
    entry_id,
    visibility
  )
  values (
    new.id::text,
    'private'
  )
  on conflict (entry_id)
  do nothing;

  return new;
end;
$$;

revoke all
on function
  public.sync_public_entry_settings_from_entries()
from public;

drop trigger if exists
  yerrr_sync_public_entry_settings
on public.entries;

create trigger
  yerrr_sync_public_entry_settings
after insert or delete
on public.entries
for each row
execute function
  public.sync_public_entry_settings_from_entries();

-- Backfill every existing entry as private.
insert into public.public_entry_settings (
  entry_id,
  visibility
)
select
  entry_row.id::text,
  'private'
from public.entries as entry_row
on conflict (entry_id)
do nothing;

-- Remove orphaned settings left by any earlier hard deletes.
delete from public.public_entry_settings
where not exists (
  select 1
  from public.entries
  where public.entries.id::text =
    public.public_entry_settings.entry_id
);

-- ---------------------------------------------------------------------------
-- 4. Security
-- ---------------------------------------------------------------------------

alter table public.public_entry_settings
enable row level security;

revoke all
on table public.public_entry_settings
from anon;

grant
  select,
  insert,
  update,
  delete
on table public.public_entry_settings
to authenticated;

drop policy if exists
  "Authenticated users can read public settings"
on public.public_entry_settings;

create policy
  "Authenticated users can read public settings"
on public.public_entry_settings
for select
to authenticated
using (true);

drop policy if exists
  "Authenticated users can create public settings"
on public.public_entry_settings;

create policy
  "Authenticated users can create public settings"
on public.public_entry_settings
for insert
to authenticated
with check (true);

drop policy if exists
  "Authenticated users can update public settings"
on public.public_entry_settings;

create policy
  "Authenticated users can update public settings"
on public.public_entry_settings
for update
to authenticated
using (true)
with check (true);

drop policy if exists
  "Authenticated users can delete public settings"
on public.public_entry_settings;

create policy
  "Authenticated users can delete public settings"
on public.public_entry_settings
for delete
to authenticated
using (true);

commit;