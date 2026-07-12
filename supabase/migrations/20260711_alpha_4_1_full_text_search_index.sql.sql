-- YERRR Studio
-- Alpha 4.1 — Supabase Full-Text Search Index
--
-- This migration:
-- 1. Creates a dedicated denormalized search-index table.
-- 2. Builds a weighted PostgreSQL tsvector for every entry.
-- 3. Adds a GIN index for fast full-text matching.
-- 4. Keeps the index synchronized with entries and meanings.
-- 5. Creates an authenticated RPC for ranked search.
--
-- Safe to rerun.

begin;

-- ---------------------------------------------------------------------------
-- 0. Preflight checks
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.entries') is null then
    raise exception
      'Alpha 4.1 stopped: public.entries does not exist.';
  end if;

  if to_regclass('public.meanings') is null then
    raise exception
      'Alpha 4.1 stopped: public.meanings does not exist.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'entries'
      and column_name = 'id'
  ) then
    raise exception
      'Alpha 4.1 stopped: public.entries.id does not exist.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meanings'
      and column_name = 'entry_id'
  ) then
    raise exception
      'Alpha 4.1 stopped: public.meanings.entry_id does not exist.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Dedicated search-index table
-- ---------------------------------------------------------------------------

create table if not exists public.entry_search_index (
  entry_id text primary key,
  word text not null default '',
  slug text not null default '',
  status text not null default '',
  pronunciation text not null default '',
  alternate_spellings text not null default '',
  is_deleted boolean not null default false,
  entry_document jsonb not null default '{}'::jsonb,
  meanings_document jsonb not null default '[]'::jsonb,
  search_vector tsvector not null default ''::tsvector,
  updated_at timestamptz not null default now()
);

create index if not exists entry_search_index_vector_gin
  on public.entry_search_index
  using gin (search_vector);

create index if not exists entry_search_index_word_lower_idx
  on public.entry_search_index (lower(word));

create index if not exists entry_search_index_status_idx
  on public.entry_search_index (status);

create index if not exists entry_search_index_active_idx
  on public.entry_search_index (is_deleted)
  where is_deleted = false;

comment on table public.entry_search_index is
  'YERRR Studio denormalized PostgreSQL full-text search index.';

comment on column public.entry_search_index.search_vector is
  'Weighted tsvector: word=A, alternate forms/slug/pronunciation=B, meanings=C, remaining entry fields=D.';

-- The browser should query through the RPC rather than selecting this table.
alter table public.entry_search_index enable row level security;

revoke all
  on table public.entry_search_index
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Build or rebuild one entry's search document
-- ---------------------------------------------------------------------------

create or replace function public.refresh_entry_search_index(
  p_entry_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry jsonb;
  v_meanings jsonb;

  v_word text;
  v_slug text;
  v_status text;
  v_pronunciation text;
  v_alternate_spellings text;

  v_deleted_marker text;
  v_deleted_at text;
  v_is_deleted boolean;

  v_search_vector tsvector;
begin
  if nullif(btrim(p_entry_id), '') is null then
    return;
  end if;

  select to_jsonb(entry_row)
  into v_entry
  from public.entries as entry_row
  where entry_row.id::text = p_entry_id
  limit 1;

  -- A hard-deleted entry should also disappear from the search index.
  if v_entry is null then
    delete from public.entry_search_index
    where entry_id = p_entry_id;

    return;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(meaning_row)),
    '[]'::jsonb
  )
  into v_meanings
  from public.meanings as meaning_row
  where meaning_row.entry_id::text = p_entry_id;

  -- Read common camelCase and snake_case field variants.
  v_word := coalesce(
    v_entry ->> 'word',
    v_entry ->> 'term',
    v_entry ->> 'entry',
    v_entry ->> 'title',
    v_entry ->> 'name',
    v_entry ->> 'phrase',
    ''
  );

  v_slug := coalesce(
    v_entry ->> 'slug',
    ''
  );

  v_status := coalesce(
    v_entry ->> 'status',
    v_entry ->> 'workflow_status',
    v_entry ->> 'workflowStatus',
    v_entry ->> 'publish_status',
    v_entry ->> 'publishStatus',
    v_entry ->> 'state',
    ''
  );

  v_pronunciation := coalesce(
    v_entry ->> 'pronunciation',
    v_entry ->> 'pronunciation_text',
    v_entry ->> 'pronunciationText',
    ''
  );

  v_alternate_spellings := coalesce(
    v_entry ->> 'alternate_spellings',
    v_entry ->> 'alternateSpellings',
    v_entry ->> 'alternate_forms',
    v_entry ->> 'alternateForms',
    ''
  );

  v_deleted_marker := lower(
    coalesce(
      v_entry ->> 'is_deleted',
      v_entry ->> 'isDeleted',
      v_entry ->> 'in_trash',
      v_entry ->> 'inTrash',
      'false'
    )
  );

  v_deleted_at := coalesce(
    v_entry ->> 'deleted_at',
    v_entry ->> 'deletedAt',
    v_entry ->> 'trashed_at',
    v_entry ->> 'trashedAt',
    ''
  );

  v_is_deleted :=
    v_deleted_marker in ('true', '1', 'yes', 'y')
    or nullif(btrim(v_deleted_at), '') is not null;

  -- "simple" preserves slang tokens instead of aggressively stemming them.
  -- Weight A: exact entry word
  -- Weight B: slug, pronunciation, alternate spellings
  -- Weight C: every string value stored in meanings
  -- Weight D: every remaining string value stored on the entry
  v_search_vector :=
      setweight(
        to_tsvector(
          'simple',
          coalesce(v_word, '')
        ),
        'A'
      )
    ||
      setweight(
        to_tsvector(
          'simple',
          concat_ws(
            ' ',
            coalesce(v_slug, ''),
            coalesce(v_pronunciation, ''),
            coalesce(v_alternate_spellings, '')
          )
        ),
        'B'
      )
    ||
      setweight(
        jsonb_to_tsvector(
          'simple',
          coalesce(v_meanings, '[]'::jsonb),
          '["string"]'::jsonb
        ),
        'C'
      )
    ||
      setweight(
        jsonb_to_tsvector(
          'simple',
          coalesce(v_entry, '{}'::jsonb),
          '["string"]'::jsonb
        ),
        'D'
      );

  insert into public.entry_search_index (
    entry_id,
    word,
    slug,
    status,
    pronunciation,
    alternate_spellings,
    is_deleted,
    entry_document,
    meanings_document,
    search_vector,
    updated_at
  )
  values (
    p_entry_id,
    v_word,
    v_slug,
    v_status,
    v_pronunciation,
    v_alternate_spellings,
    v_is_deleted,
    v_entry,
    v_meanings,
    v_search_vector,
    now()
  )
  on conflict (entry_id)
  do update set
    word = excluded.word,
    slug = excluded.slug,
    status = excluded.status,
    pronunciation = excluded.pronunciation,
    alternate_spellings = excluded.alternate_spellings,
    is_deleted = excluded.is_deleted,
    entry_document = excluded.entry_document,
    meanings_document = excluded.meanings_document,
    search_vector = excluded.search_vector,
    updated_at = now();
end;
$$;

revoke all
  on function public.refresh_entry_search_index(text)
  from public;

-- ---------------------------------------------------------------------------
-- 3. Trigger synchronization
-- ---------------------------------------------------------------------------

create or replace function public.sync_entry_search_from_entries()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.entry_search_index
    where entry_id = old.id::text;

    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.id::text is distinct from new.id::text then
    delete from public.entry_search_index
    where entry_id = old.id::text;
  end if;

  perform public.refresh_entry_search_index(new.id::text);

  return new;
end;
$$;

create or replace function public.sync_entry_search_from_meanings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_entry_search_index(
      old.entry_id::text
    );

    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.entry_id::text is distinct from new.entry_id::text then
    perform public.refresh_entry_search_index(
      old.entry_id::text
    );
  end if;

  perform public.refresh_entry_search_index(
    new.entry_id::text
  );

  return new;
end;
$$;

revoke all
  on function public.sync_entry_search_from_entries()
  from public;

revoke all
  on function public.sync_entry_search_from_meanings()
  from public;

drop trigger if exists yerrr_sync_entry_search_entries
  on public.entries;

create trigger yerrr_sync_entry_search_entries
after insert or update or delete
on public.entries
for each row
execute function public.sync_entry_search_from_entries();

drop trigger if exists yerrr_sync_entry_search_meanings
  on public.meanings;

create trigger yerrr_sync_entry_search_meanings
after insert or update or delete
on public.meanings
for each row
execute function public.sync_entry_search_from_meanings();

-- ---------------------------------------------------------------------------
-- 4. Initial backfill
-- ---------------------------------------------------------------------------

do $$
declare
  entry_record record;
begin
  for entry_record in
    select id::text as entry_id
    from public.entries
  loop
    perform public.refresh_entry_search_index(
      entry_record.entry_id
    );
  end loop;
end
$$;

-- Remove stale search rows left behind by any earlier hard deletes.
delete from public.entry_search_index as search_row
where not exists (
  select 1
  from public.entries as entry_row
  where entry_row.id::text = search_row.entry_id
);

-- ---------------------------------------------------------------------------
-- 5. Ranked authenticated search RPC
-- ---------------------------------------------------------------------------

create or replace function public.search_entries_fts(
  p_query text,
  p_limit integer default 50
)
returns table (
  entry_id text,
  word text,
  slug text,
  status text,
  pronunciation text,
  alternate_spellings text,
  rank real,
  headline text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_query tsquery;
  v_limit integer;
begin
  if nullif(btrim(p_query), '') is null then
    return;
  end if;

  v_limit := least(
    greatest(coalesce(p_limit, 50), 1),
    100
  );

  v_query := websearch_to_tsquery(
    'simple',
    btrim(p_query)
  );

  return query
  select
    search_row.entry_id,
    search_row.word,
    search_row.slug,
    search_row.status,
    search_row.pronunciation,
    search_row.alternate_spellings,
    ts_rank_cd(
      search_row.search_vector,
      v_query,
      32
    )::real as rank,
    ts_headline(
      'simple',
      concat_ws(
        ' ',
        search_row.word,
        search_row.alternate_spellings,
        search_row.entry_document::text,
        search_row.meanings_document::text
      ),
      v_query,
      'StartSel=<mark>, StopSel=</mark>, MaxWords=24, MinWords=8, ShortWord=2, HighlightAll=false'
    ) as headline
  from public.entry_search_index as search_row
  where search_row.is_deleted = false
    and search_row.search_vector @@ v_query
  order by
    rank desc,
    lower(search_row.word) asc
  limit v_limit;
end;
$$;

revoke all
  on function public.search_entries_fts(text, integer)
  from public;

grant execute
  on function public.search_entries_fts(text, integer)
  to authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Alpha 4.1 verification queries
-- Run these separately after the migration succeeds.
-- ---------------------------------------------------------------------------

-- 1. The indexed row count should match the entries row count:
--
-- select
--   (select count(*) from public.entries) as entries_count,
--   (select count(*) from public.entry_search_index) as indexed_count;

-- 2. Confirm the GIN index exists:
--
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and tablename = 'entry_search_index'
-- order by indexname;

-- 3. Test ranked searches:
--
-- select * from public.search_entries_fts('brick', 20);
-- select * from public.search_entries_fts('keep it a buck', 20);
-- select * from public.search_entries_fts('"keep it a buck"', 20);

-- 4. Confirm both synchronization triggers exist:
--
-- select
--   event_object_table,
--   trigger_name,
--   event_manipulation
-- from information_schema.triggers
-- where trigger_schema = 'public'
--   and trigger_name in (
--     'yerrr_sync_entry_search_entries',
--     'yerrr_sync_entry_search_meanings'
--   )
-- order by event_object_table, event_manipulation;