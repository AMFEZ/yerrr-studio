-- YERRR Studio
-- Alpha 4.3 — Smart Ranking, Prefix Search, and Typo Tolerance
--
-- Run after Alpha 4.1 and Alpha 4.2.
-- Safe to rerun.

begin;

do $$
begin
  if to_regclass(
    'public.entry_search_index'
  ) is null then
    raise exception
      'Alpha 4.3 stopped: public.entry_search_index does not exist. Run Alpha 4.1 first.';
  end if;
end
$$;

create schema if not exists extensions;

create extension if not exists pg_trgm
  with schema extensions;

alter table public.entry_search_index
  add column if not exists fuzzy_text text
  not null
  default '';

create or replace function public.set_entry_search_fuzzy_text()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  new.fuzzy_text := lower(
    concat_ws(
      ' ',
      coalesce(new.word, ''),
      replace(
        coalesce(new.slug, ''),
        '-',
        ' '
      ),
      coalesce(new.pronunciation, ''),
      coalesce(
        new.alternate_spellings,
        ''
      ),
      coalesce(
        new.entry_document::text,
        ''
      ),
      coalesce(
        new.meanings_document::text,
        ''
      )
    )
  );

  return new;
end;
$$;

revoke all
  on function public.set_entry_search_fuzzy_text()
  from public;

drop trigger if exists
  yerrr_set_entry_search_fuzzy_text
on public.entry_search_index;

create trigger
  yerrr_set_entry_search_fuzzy_text
before insert or update of
  word,
  slug,
  pronunciation,
  alternate_spellings,
  entry_document,
  meanings_document
on public.entry_search_index
for each row
execute function
  public.set_entry_search_fuzzy_text();

update public.entry_search_index
set word = word;

do $$
declare
  extension_schema text;
begin
  select namespace.nspname
  into extension_schema
  from pg_extension as extension
  join pg_namespace as namespace
    on namespace.oid =
      extension.extnamespace
  where extension.extname = 'pg_trgm';

  if extension_schema is null then
    raise exception
      'Alpha 4.3 stopped: pg_trgm could not be enabled.';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename =
        'entry_search_index'
      and indexname =
        'entry_search_index_fuzzy_gin'
  ) then
    execute format(
      'create index entry_search_index_fuzzy_gin
       on public.entry_search_index
       using gin (
         fuzzy_text %I.gin_trgm_ops
       )',
      extension_schema
    );
  end if;
end
$$;

create or replace function public.search_entries_smart(
  p_query text,
  p_match_mode text default 'all',
  p_limit integer default 50,
  p_fuzzy_threshold real default 0.22
)
returns table (
  entry_id text,
  word text,
  slug text,
  status text,
  pronunciation text,
  alternate_spellings text,
  rank real,
  full_text_rank real,
  fuzzy_rank real,
  match_type text,
  headline text
)
language plpgsql
stable
security definer
set search_path =
  public,
  extensions,
  pg_temp
as $$
declare
  raw_query text;
  normalized_mode text;
  safe_limit integer;
  safe_threshold real;
  parsed_query tsquery;
  any_word_query text;
begin
  raw_query := lower(
    btrim(coalesce(p_query, ''))
  );

  if raw_query = '' then
    return;
  end if;

  normalized_mode := lower(
    btrim(
      coalesce(p_match_mode, 'all')
    )
  );

  if normalized_mode not in (
    'all',
    'any',
    'phrase'
  ) then
    normalized_mode := 'all';
  end if;

  safe_limit := least(
    greatest(
      coalesce(p_limit, 50),
      1
    ),
    100
  );

  safe_threshold := greatest(
    least(
      coalesce(
        p_fuzzy_threshold,
        0.22
      ),
      0.95
    ),
    case
      when length(raw_query) <= 3
        then 0.35
      when length(raw_query) <= 5
        then 0.26
      else 0.18
    end
  );

  if normalized_mode = 'phrase' then
    parsed_query := phraseto_tsquery(
      'simple',
      raw_query
    );
  elsif normalized_mode = 'any' then
    select string_agg(
      token,
      ' OR '
    )
    into any_word_query
    from regexp_split_to_table(
      regexp_replace(
        raw_query,
        '[^[:alnum:]'']+',
        ' ',
        'g'
      ),
      '\s+'
    ) as token_rows(token)
    where token_rows.token <> '';

    parsed_query := websearch_to_tsquery(
      'simple',
      coalesce(
        any_word_query,
        raw_query
      )
    );
  else
    parsed_query := plainto_tsquery(
      'simple',
      raw_query
    );
  end if;

  return query
  with scored as (
    select
      search_row.entry_id,
      search_row.word,
      search_row.slug,
      search_row.status,
      search_row.pronunciation,
      search_row.alternate_spellings,

      (
        search_row.search_vector
          @@ parsed_query
      ) as is_full_text_match,

      ts_rank_cd(
        search_row.search_vector,
        parsed_query,
        32
      )::real
        as calculated_full_text_rank,

      greatest(
        similarity(
          lower(search_row.word),
          raw_query
        ),
        similarity(
          lower(
            replace(
              search_row.slug,
              '-',
              ' '
            )
          ),
          raw_query
        ),
        similarity(
          lower(
            search_row.alternate_spellings
          ),
          raw_query
        ),
        word_similarity(
          raw_query,
          search_row.fuzzy_text
        )
      )::real
        as calculated_fuzzy_rank,

      case
        when lower(search_row.word)
          = raw_query
          then 10.0
        when lower(
          replace(
            search_row.slug,
            '-',
            ' '
          )
        ) = raw_query
          then 9.5
        when lower(
          search_row.alternate_spellings
        ) = raw_query
          then 9.0
        when lower(search_row.word)
          like raw_query || '%'
          then 7.0
        when lower(
          search_row.alternate_spellings
        ) like
          '%' || raw_query || '%'
          then 6.0
        else 0.0
      end::real
        as lexical_boost,

      case
        when lower(search_row.word)
          = raw_query
          then 'exact'
        when lower(
          replace(
            search_row.slug,
            '-',
            ' '
          )
        ) = raw_query
          then 'exact'
        when lower(
          search_row.alternate_spellings
        ) = raw_query
          then 'alternate'
        when lower(search_row.word)
          like raw_query || '%'
          then 'prefix'
        when lower(
          search_row.alternate_spellings
        ) like
          '%' || raw_query || '%'
          then 'alternate'
        when search_row.search_vector
          @@ parsed_query
          then 'full_text'
        else 'fuzzy'
      end
        as calculated_match_type,

      case
        when search_row.search_vector
          @@ parsed_query
        then ts_headline(
          'simple',
          concat_ws(
            ' ',
            search_row.word,
            search_row.alternate_spellings,
            search_row.entry_document::text,
            search_row.meanings_document::text
          ),
          parsed_query,
          'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=8, ShortWord=2, HighlightAll=false'
        )
        else left(
          concat_ws(
            ' ',
            search_row.word,
            search_row.alternate_spellings,
            search_row.meanings_document::text
          ),
          280
        )
      end
        as calculated_headline
    from public.entry_search_index
      as search_row
    where search_row.is_deleted = false
  ),
  eligible as (
    select
      scored.*,
      (
        scored.lexical_boost
        + scored.calculated_full_text_rank
          * 8.0
        + scored.calculated_fuzzy_rank
          * 4.0
      )::real
        as calculated_rank
    from scored
    where
      scored.is_full_text_match
      or scored.lexical_boost > 0
      or (
        normalized_mode <> 'phrase'
        and scored.calculated_fuzzy_rank
          >= safe_threshold
      )
  )
  select
    eligible.entry_id,
    eligible.word,
    eligible.slug,
    eligible.status,
    eligible.pronunciation,
    eligible.alternate_spellings,
    eligible.calculated_rank
      as rank,
    eligible.calculated_full_text_rank
      as full_text_rank,
    eligible.calculated_fuzzy_rank
      as fuzzy_rank,
    eligible.calculated_match_type
      as match_type,
    eligible.calculated_headline
      as headline
  from eligible
  order by
    eligible.calculated_rank desc,
    lower(eligible.word) asc
  limit safe_limit;
end;
$$;

revoke all
  on function public.search_entries_smart(
    text,
    text,
    integer,
    real
  )
  from public;

grant execute
  on function public.search_entries_smart(
    text,
    text,
    integer,
    real
  )
  to authenticated, service_role;

commit;

-- Verification:
--
-- select * from public.search_entries_smart(
--   'brick', 'all', 20, 0.22
-- );
--
-- select * from public.search_entries_smart(
--   'bri', 'all', 20, 0.22
-- );
--
-- select * from public.search_entries_smart(
--   'brik', 'all', 20, 0.22
-- );
--
-- select * from public.search_entries_smart(
--   'keep it a buck',
--   'phrase',
--   20,
--   0.22
-- );
--
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and tablename =
--     'entry_search_index'
--   and indexname =
--     'entry_search_index_fuzzy_gin';