begin;

create extension if not exists pgcrypto;

create table if not exists public.entry_media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id text not null,
  kind text not null check (kind in ('image', 'audio')),
  bucket text not null check (bucket in ('entry-images', 'entry-audio')),
  object_path text not null,
  filename text not null,
  mime_type text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  public_url text not null default '',
  alt_text text not null default '',
  attribution text not null default '',
  source_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entry_media_assets_user_entry_kind_key unique (user_id, entry_id, kind),
  constraint entry_media_assets_object_path_key unique (bucket, object_path)
);

create index if not exists entry_media_assets_entry_id_idx
  on public.entry_media_assets (entry_id);

create index if not exists entry_media_assets_user_updated_idx
  on public.entry_media_assets (user_id, updated_at desc);

alter table public.entry_media_assets enable row level security;

drop policy if exists "entry_media_assets_select_own" on public.entry_media_assets;
create policy "entry_media_assets_select_own"
  on public.entry_media_assets
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "entry_media_assets_insert_own" on public.entry_media_assets;
create policy "entry_media_assets_insert_own"
  on public.entry_media_assets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "entry_media_assets_update_own" on public.entry_media_assets;
create policy "entry_media_assets_update_own"
  on public.entry_media_assets
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "entry_media_assets_delete_own" on public.entry_media_assets;
create policy "entry_media_assets_delete_own"
  on public.entry_media_assets
  for delete
  to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'entry-images',
    'entry-images',
    true,
    8388608,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'entry-audio',
    'entry-audio',
    true,
    20971520,
    array[
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/x-m4a',
      'audio/ogg',
      'audio/webm'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "entry_media_storage_select_own" on storage.objects;
create policy "entry_media_storage_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id in ('entry-images', 'entry-audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "entry_media_storage_insert_own" on storage.objects;
create policy "entry_media_storage_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('entry-images', 'entry-audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "entry_media_storage_update_own" on storage.objects;
create policy "entry_media_storage_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('entry-images', 'entry-audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('entry-images', 'entry-audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "entry_media_storage_delete_own" on storage.objects;
create policy "entry_media_storage_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('entry-images', 'entry-audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;

notify pgrst, 'reload schema';
