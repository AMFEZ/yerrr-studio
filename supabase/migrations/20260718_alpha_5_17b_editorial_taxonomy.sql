create extension if not exists pgcrypto;

create table if not exists public.editorial_taxonomy_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('category', 'tone')),
  label text not null check (char_length(trim(label)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists editorial_taxonomy_options_user_kind_label_unique
  on public.editorial_taxonomy_options (
    user_id,
    kind,
    lower(trim(label))
  );

create index if not exists editorial_taxonomy_options_user_kind_idx
  on public.editorial_taxonomy_options (user_id, kind, is_active);

create or replace function public.set_editorial_taxonomy_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_editorial_taxonomy_updated_at
  on public.editorial_taxonomy_options;

create trigger set_editorial_taxonomy_updated_at
before update on public.editorial_taxonomy_options
for each row
execute function public.set_editorial_taxonomy_updated_at();

alter table public.editorial_taxonomy_options enable row level security;

revoke all on public.editorial_taxonomy_options from anon;
grant select, insert, update, delete on public.editorial_taxonomy_options to authenticated;

drop policy if exists "Users can read their editorial taxonomy" on public.editorial_taxonomy_options;
create policy "Users can read their editorial taxonomy"
on public.editorial_taxonomy_options
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their editorial taxonomy" on public.editorial_taxonomy_options;
create policy "Users can create their editorial taxonomy"
on public.editorial_taxonomy_options
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their editorial taxonomy" on public.editorial_taxonomy_options;
create policy "Users can update their editorial taxonomy"
on public.editorial_taxonomy_options
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their editorial taxonomy" on public.editorial_taxonomy_options;
create policy "Users can delete their editorial taxonomy"
on public.editorial_taxonomy_options
for delete
to authenticated
using (auth.uid() = user_id);

-- Refresh the PostgREST schema cache after creating the table.
notify pgrst, 'reload schema';
