-- YERRR Studio
-- Alpha 4.4 — Knowledge Graph-Aware Search and Related Discovery
--
-- Run after Alpha 4.3.
-- Safe to rerun.
--
-- This migration detects the official Supabase graph tables, then creates:
-- 1. A schema-status RPC for diagnostics.
-- 2. A graph-aware ranked-search RPC.
-- 3. Optional lookup indexes on detected graph foreign-key columns.
--
-- Supported concept tables:
--   concepts, graph_concepts
--
-- Supported entry-to-concept tables:
--   entry_concepts, concept_entries,
--   entry_concept_assignments, concept_assignments
--
-- Supported relationship tables:
--   entry_relationships, relationships, graph_relationships

begin;

-- ---------------------------------------------------------------------------
-- 0. Preflight
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass(
    'public.entry_search_index'
  ) is null then
    raise exception
      'Alpha 4.4 stopped: public.entry_search_index does not exist. Run Alpha 4.1 first.';
  end if;

  if to_regprocedure(
    'public.search_entries_smart(text,text,integer,real)'
  ) is null then
    raise exception
      'Alpha 4.4 stopped: public.search_entries_smart does not exist. Run Alpha 4.3 first.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Small schema-discovery helpers
-- ---------------------------------------------------------------------------

create or replace function public.yerrr_first_existing_table(
  p_candidates text[]
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select candidate_name
  from unnest(p_candidates)
    with ordinality
    as candidate(candidate_name, candidate_order)
  where to_regclass(
    format(
      'public.%I',
      candidate_name
    )
  ) is not null
  order by candidate_order
  limit 1;
$$;

create or replace function public.yerrr_first_existing_column(
  p_table_name text,
  p_candidates text[]
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select candidate_name
  from unnest(p_candidates)
    with ordinality
    as candidate(candidate_name, candidate_order)
  where exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table_name
      and column_name = candidate_name
  )
  order by candidate_order
  limit 1;
$$;

revoke all
  on function public.yerrr_first_existing_table(text[])
  from public;

revoke all
  on function public.yerrr_first_existing_column(
    text,
    text[]
  )
  from public;

-- ---------------------------------------------------------------------------
-- 2. Diagnostic RPC
-- ---------------------------------------------------------------------------

create or replace function public.graph_search_schema_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_concepts_table text;
  v_assignments_table text;
  v_relationships_table text;

  v_concept_id_column text;
  v_assignment_entry_column text;
  v_assignment_concept_column text;
  v_relationship_source_column text;
  v_relationship_target_column text;

  v_concepts_ready boolean;
  v_relationships_ready boolean;
begin
  v_concepts_table :=
    public.yerrr_first_existing_table(
      array[
        'concepts',
        'graph_concepts'
      ]
    );

  v_assignments_table :=
    public.yerrr_first_existing_table(
      array[
        'entry_concepts',
        'concept_entries',
        'entry_concept_assignments',
        'concept_assignments'
      ]
    );

  v_relationships_table :=
    public.yerrr_first_existing_table(
      array[
        'entry_relationships',
        'relationships',
        'graph_relationships'
      ]
    );

  if v_concepts_table is not null then
    v_concept_id_column :=
      public.yerrr_first_existing_column(
        v_concepts_table,
        array[
          'id',
          'concept_id'
        ]
      );
  end if;

  if v_assignments_table is not null then
    v_assignment_entry_column :=
      public.yerrr_first_existing_column(
        v_assignments_table,
        array[
          'entry_id',
          'entryId',
          'lexicon_entry_id'
        ]
      );

    v_assignment_concept_column :=
      public.yerrr_first_existing_column(
        v_assignments_table,
        array[
          'concept_id',
          'conceptId'
        ]
      );
  end if;

  if v_relationships_table is not null then
    v_relationship_source_column :=
      public.yerrr_first_existing_column(
        v_relationships_table,
        array[
          'source_entry_id',
          'from_entry_id',
          'source_id',
          'entry_id',
          'sourceEntryId'
        ]
      );

    v_relationship_target_column :=
      public.yerrr_first_existing_column(
        v_relationships_table,
        array[
          'target_entry_id',
          'to_entry_id',
          'target_id',
          'related_entry_id',
          'targetEntryId'
        ]
      );
  end if;

  v_concepts_ready :=
    v_concepts_table is not null
    and v_assignments_table is not null
    and v_concept_id_column is not null
    and v_assignment_entry_column is not null
    and v_assignment_concept_column is not null;

  v_relationships_ready :=
    v_relationships_table is not null
    and v_relationship_source_column is not null
    and v_relationship_target_column is not null;

  return jsonb_build_object(
    'ready',
      v_concepts_ready
      or v_relationships_ready,
    'concepts_ready',
      v_concepts_ready,
    'relationships_ready',
      v_relationships_ready,
    'concepts_table',
      v_concepts_table,
    'assignments_table',
      v_assignments_table,
    'relationships_table',
      v_relationships_table,
    'concept_id_column',
      v_concept_id_column,
    'assignment_entry_column',
      v_assignment_entry_column,
    'assignment_concept_column',
      v_assignment_concept_column,
    'relationship_source_column',
      v_relationship_source_column,
    'relationship_target_column',
      v_relationship_target_column
  );
end;
$$;

revoke all
  on function public.graph_search_schema_status()
  from public;

grant execute
  on function public.graph_search_schema_status()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Add lookup indexes to detected graph columns
-- ---------------------------------------------------------------------------

do $$
declare
  v_status jsonb;
  v_table text;
  v_column text;
  v_index_name text;
begin
  v_status :=
    public.graph_search_schema_status();

  if coalesce(
    (v_status ->> 'concepts_ready')::boolean,
    false
  ) then
    v_table :=
      v_status ->> 'assignments_table';

    foreach v_column in array array[
      v_status ->> 'assignment_entry_column',
      v_status ->> 'assignment_concept_column'
    ]
    loop
      v_index_name := left(
        format(
          'yerrr_graph_search_%s_%s_idx',
          v_table,
          v_column
        ),
        63
      );

      if not exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and indexname = v_index_name
      ) then
        execute format(
          'create index %I on public.%I (%I)',
          v_index_name,
          v_table,
          v_column
        );
      end if;
    end loop;
  end if;

  if coalesce(
    (v_status ->> 'relationships_ready')::boolean,
    false
  ) then
    v_table :=
      v_status ->> 'relationships_table';

    foreach v_column in array array[
      v_status ->> 'relationship_source_column',
      v_status ->> 'relationship_target_column'
    ]
    loop
      v_index_name := left(
        format(
          'yerrr_graph_search_%s_%s_idx',
          v_table,
          v_column
        ),
        63
      );

      if not exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and indexname = v_index_name
      ) then
        execute format(
          'create index %I on public.%I (%I)',
          v_index_name,
          v_table,
          v_column
        );
      end if;
    end loop;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Graph-aware search RPC
-- ---------------------------------------------------------------------------

create or replace function public.search_entries_graph_aware(
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
  graph_rank real,
  match_type text,
  headline text,
  concepts jsonb,
  relationships jsonb,
  match_reasons text[]
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
  v_schema jsonb;

  v_concepts_table text;
  v_assignments_table text;
  v_relationships_table text;

  v_concept_id_column text;
  v_assignment_entry_column text;
  v_assignment_concept_column text;
  v_relationship_source_column text;
  v_relationship_target_column text;

  v_concepts_ready boolean;
  v_relationships_ready boolean;

  v_safe_limit integer;
  v_concept_cte text;
  v_relationship_cte text;
  v_sql text;
begin
  if nullif(
    btrim(coalesce(p_query, '')),
    ''
  ) is null then
    return;
  end if;

  v_safe_limit := least(
    greatest(
      coalesce(p_limit, 50),
      1
    ),
    100
  );

  v_schema :=
    public.graph_search_schema_status();

  v_concepts_ready :=
    coalesce(
      (v_schema ->> 'concepts_ready')::boolean,
      false
    );

  v_relationships_ready :=
    coalesce(
      (v_schema ->> 'relationships_ready')::boolean,
      false
    );

  v_concepts_table :=
    v_schema ->> 'concepts_table';

  v_assignments_table :=
    v_schema ->> 'assignments_table';

  v_relationships_table :=
    v_schema ->> 'relationships_table';

  v_concept_id_column :=
    v_schema ->> 'concept_id_column';

  v_assignment_entry_column :=
    v_schema ->> 'assignment_entry_column';

  v_assignment_concept_column :=
    v_schema ->> 'assignment_concept_column';

  v_relationship_source_column :=
    v_schema ->> 'relationship_source_column';

  v_relationship_target_column :=
    v_schema ->> 'relationship_target_column';

  if v_concepts_ready then
    v_concept_cte := format(
      $concept$
      concept_context as (
        select
          assignment.%1$I::text
            as entry_id,

          coalesce(
            jsonb_agg(
              distinct jsonb_build_object(
                'id',
                  concept.%2$I::text,
                'name',
                  coalesce(
                    to_jsonb(concept) ->> 'name',
                    to_jsonb(concept) ->> 'title',
                    to_jsonb(concept) ->> 'label',
                    concept.%2$I::text
                  ),
                'description',
                  coalesce(
                    to_jsonb(concept)
                      ->> 'description',
                    to_jsonb(concept)
                      ->> 'definition',
                    to_jsonb(concept)
                      ->> 'notes',
                    ''
                  )
              )
            ) filter (
              where concept.%2$I
                is not null
            ),
            '[]'::jsonb
          ) as concepts,

          bool_or(
            lower(
              concat_ws(
                ' ',
                coalesce(
                  to_jsonb(concept)
                    ->> 'name',
                  to_jsonb(concept)
                    ->> 'title',
                  to_jsonb(concept)
                    ->> 'label',
                  ''
                ),
                coalesce(
                  to_jsonb(concept)
                    ->> 'description',
                  to_jsonb(concept)
                    ->> 'definition',
                  to_jsonb(concept)
                    ->> 'notes',
                  ''
                )
              )
            )
            like
              '%%'
              || lower($1)
              || '%%'
            or word_similarity(
              lower($1),
              lower(
                concat_ws(
                  ' ',
                  coalesce(
                    to_jsonb(concept)
                      ->> 'name',
                    to_jsonb(concept)
                      ->> 'title',
                    to_jsonb(concept)
                      ->> 'label',
                    ''
                  ),
                  coalesce(
                    to_jsonb(concept)
                      ->> 'description',
                    to_jsonb(concept)
                      ->> 'definition',
                    to_jsonb(concept)
                      ->> 'notes',
                    ''
                  )
                )
              )
            ) >= 0.42
          ) as concept_match,

          bool_or(
            lower(
              coalesce(
                to_jsonb(concept)
                  ->> 'name',
                to_jsonb(concept)
                  ->> 'title',
                to_jsonb(concept)
                  ->> 'label',
                ''
              )
            ) = lower($1)
          ) as concept_exact,

          coalesce(
            max(
              word_similarity(
                lower($1),
                lower(
                  concat_ws(
                    ' ',
                    coalesce(
                      to_jsonb(concept)
                        ->> 'name',
                      to_jsonb(concept)
                        ->> 'title',
                      to_jsonb(concept)
                        ->> 'label',
                      ''
                    ),
                    coalesce(
                      to_jsonb(concept)
                        ->> 'description',
                      to_jsonb(concept)
                        ->> 'definition',
                      to_jsonb(concept)
                        ->> 'notes',
                      ''
                    )
                  )
                )
              )
            ),
            0
          )::real as concept_similarity

        from public.%3$I
          as assignment

        join public.%4$I
          as concept
          on concept.%2$I::text
            =
            assignment.%5$I::text

        group by
          assignment.%1$I::text
      )
      $concept$,
      v_assignment_entry_column,
      v_concept_id_column,
      v_assignments_table,
      v_concepts_table,
      v_assignment_concept_column
    );
  else
    v_concept_cte :=
      $concept_empty$
      concept_context as (
        select
          null::text as entry_id,
          '[]'::jsonb as concepts,
          false as concept_match,
          false as concept_exact,
          0::real as concept_similarity
        where false
      )
      $concept_empty$;
  end if;

  if v_relationships_ready then
    v_relationship_cte := format(
      $relationship$
      relationship_edges as (
        select
          relationship.%1$I::text
            as entry_id,
          relationship.%2$I::text
            as related_entry_id,
          'outgoing'::text
            as direction,
          to_jsonb(relationship)
            as relationship_document

        from public.%3$I
          as relationship

        union all

        select
          relationship.%2$I::text
            as entry_id,
          relationship.%1$I::text
            as related_entry_id,
          'incoming'::text
            as direction,
          to_jsonb(relationship)
            as relationship_document

        from public.%3$I
          as relationship
      ),

      relationship_context as (
        select
          edge.entry_id,

          coalesce(
            jsonb_agg(
              distinct jsonb_build_object(
                'related_entry_id',
                  edge.related_entry_id,
                'related_word',
                  coalesce(
                    related_entry.word,
                    'Related entry'
                  ),
                'relationship_type',
                  coalesce(
                    edge.relationship_document
                      ->> 'relationship_type',
                    edge.relationship_document
                      ->> 'relation_type',
                    edge.relationship_document
                      ->> 'type',
                    edge.relationship_document
                      ->> 'label',
                    'related'
                  ),
                'direction',
                  edge.direction
              )
            ) filter (
              where edge.related_entry_id
                is not null
            ),
            '[]'::jsonb
          ) as relationships,

          bool_or(
            lower(
              concat_ws(
                ' ',
                coalesce(
                  edge.relationship_document
                    ->> 'relationship_type',
                  edge.relationship_document
                    ->> 'relation_type',
                  edge.relationship_document
                    ->> 'type',
                  edge.relationship_document
                    ->> 'label',
                  ''
                ),
                coalesce(
                  edge.relationship_document
                    ->> 'description',
                  edge.relationship_document
                    ->> 'notes',
                  ''
                ),
                coalesce(
                  related_entry.word,
                  ''
                )
              )
            )
            like
              '%%'
              || lower($1)
              || '%%'
            or word_similarity(
              lower($1),
              lower(
                concat_ws(
                  ' ',
                  coalesce(
                    edge.relationship_document
                      ->> 'relationship_type',
                    edge.relationship_document
                      ->> 'relation_type',
                    edge.relationship_document
                      ->> 'type',
                    edge.relationship_document
                      ->> 'label',
                    ''
                  ),
                  coalesce(
                    edge.relationship_document
                      ->> 'description',
                    edge.relationship_document
                      ->> 'notes',
                    ''
                  ),
                  coalesce(
                    related_entry.word,
                    ''
                  )
                )
              )
            ) >= 0.46
          ) as relationship_match,

          coalesce(
            max(
              word_similarity(
                lower($1),
                lower(
                  concat_ws(
                    ' ',
                    coalesce(
                      edge.relationship_document
                        ->> 'relationship_type',
                      edge.relationship_document
                        ->> 'relation_type',
                      edge.relationship_document
                        ->> 'type',
                      edge.relationship_document
                        ->> 'label',
                      ''
                    ),
                    coalesce(
                      edge.relationship_document
                        ->> 'description',
                      edge.relationship_document
                        ->> 'notes',
                      ''
                    ),
                    coalesce(
                      related_entry.word,
                      ''
                    )
                  )
                )
              )
            ),
            0
          )::real as relationship_similarity

        from relationship_edges
          as edge

        left join public.entry_search_index
          as related_entry
          on related_entry.entry_id
            =
            edge.related_entry_id

        group by edge.entry_id
      )
      $relationship$,
      v_relationship_source_column,
      v_relationship_target_column,
      v_relationships_table
    );
  else
    v_relationship_cte :=
      $relationship_empty$
      relationship_edges as (
        select
          null::text as entry_id,
          null::text as related_entry_id,
          null::text as direction,
          '{}'::jsonb
            as relationship_document
        where false
      ),

      relationship_context as (
        select
          null::text as entry_id,
          '[]'::jsonb as relationships,
          false as relationship_match,
          0::real as relationship_similarity
        where false
      )
      $relationship_empty$;
  end if;

  v_sql := format(
    $query$
    with
    base_search as (
      select *
      from public.search_entries_smart(
        $1,
        $2,
        100,
        $4
      )
    ),

    %1$s,

    %2$s,

    graph_candidates as (
      select entry_id
      from concept_context
      where concept_match

      union

      select entry_id
      from relationship_context
      where relationship_match
    ),

    candidate_ids as (
      select entry_id
      from base_search

      union

      select entry_id
      from graph_candidates
    ),

    enriched as (
      select
        search_row.entry_id,
        search_row.word,
        search_row.slug,
        search_row.status,
        search_row.pronunciation,
        search_row.alternate_spellings,

        base_search.rank
          as lexical_rank,

        base_search.full_text_rank,
        base_search.fuzzy_rank,
        base_search.match_type
          as lexical_match_type,
        base_search.headline
          as lexical_headline,

        coalesce(
          concept_context.concepts,
          '[]'::jsonb
        ) as concepts,

        coalesce(
          relationship_context.relationships,
          '[]'::jsonb
        ) as relationships,

        coalesce(
          concept_context.concept_match,
          false
        ) as concept_match,

        coalesce(
          concept_context.concept_exact,
          false
        ) as concept_exact,

        coalesce(
          concept_context.concept_similarity,
          0
        ) as concept_similarity,

        coalesce(
          relationship_context.relationship_match,
          false
        ) as relationship_match,

        coalesce(
          relationship_context.relationship_similarity,
          0
        ) as relationship_similarity,

        (
          case
            when coalesce(
              concept_context.concept_exact,
              false
            )
              then 7.0

            when coalesce(
              concept_context.concept_match,
              false
            )
              then
                4.0
                +
                coalesce(
                  concept_context.concept_similarity,
                  0
                ) * 2.0

            else 0.0
          end

          +

          case
            when coalesce(
              relationship_context.relationship_match,
              false
            )
              then
                2.5
                +
                coalesce(
                  relationship_context.relationship_similarity,
                  0
                ) * 1.5

            else 0.0
          end
        )::real as calculated_graph_rank

      from candidate_ids
        as candidate

      join public.entry_search_index
        as search_row
        on search_row.entry_id
          =
          candidate.entry_id

      left join base_search
        on base_search.entry_id
          =
          candidate.entry_id

      left join concept_context
        on concept_context.entry_id
          =
          candidate.entry_id

      left join relationship_context
        on relationship_context.entry_id
          =
          candidate.entry_id

      where search_row.is_deleted = false
    )

    select
      enriched.entry_id,
      enriched.word,
      enriched.slug,
      enriched.status,
      enriched.pronunciation,
      enriched.alternate_spellings,

      (
        coalesce(
          enriched.lexical_rank,
          0
        )
        +
        enriched.calculated_graph_rank
      )::real as rank,

      coalesce(
        enriched.full_text_rank,
        0
      )::real as full_text_rank,

      coalesce(
        enriched.fuzzy_rank,
        0
      )::real as fuzzy_rank,

      enriched.calculated_graph_rank
        as graph_rank,

      case
        when enriched.lexical_rank is null
          and enriched.calculated_graph_rank > 0
          then 'graph'

        else coalesce(
          enriched.lexical_match_type,
          'graph'
        )
      end as match_type,

      case
        when nullif(
          btrim(
            coalesce(
              enriched.lexical_headline,
              ''
            )
          ),
          ''
        ) is not null
          then enriched.lexical_headline

        else left(
          concat_ws(
            ' ',
            enriched.concepts::text,
            enriched.relationships::text
          ),
          280
        )
      end as headline,

      enriched.concepts,
      enriched.relationships,

      array_remove(
        array[
          case
            when enriched.lexical_rank
              is not null
              then 'Lexicon text match'
          end,

          case
            when enriched.concept_match
              then 'Concept match'
          end,

          case
            when enriched.relationship_match
              then 'Relationship match'
          end
        ],
        null
      )::text[] as match_reasons

    from enriched

    order by
      rank desc,
      lower(enriched.word) asc

    limit $3
    $query$,
    v_concept_cte,
    v_relationship_cte
  );

  return query execute v_sql
    using
      p_query,
      p_match_mode,
      v_safe_limit,
      p_fuzzy_threshold;
end;
$$;

revoke all
  on function public.search_entries_graph_aware(
    text,
    text,
    integer,
    real
  )
  from public;

grant execute
  on function public.search_entries_graph_aware(
    text,
    text,
    integer,
    real
  )
  to authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Alpha 4.4 verification
-- Run these separately after the migration succeeds.
-- ---------------------------------------------------------------------------

-- 1. See which graph schema was detected:
--
-- select jsonb_pretty(
--   public.graph_search_schema_status()
-- );

-- 2. Search a known concept name:
--
-- select *
-- from public.search_entries_graph_aware(
--   'Money',
--   'all',
--   20,
--   0.22
-- );

-- 3. Search a known relationship label or connected entry:
--
-- select *
-- from public.search_entries_graph_aware(
--   'related',
--   'all',
--   20,
--   0.22
-- );

-- 4. Confirm ordinary lexical search still works:
--
-- select *
-- from public.search_entries_graph_aware(
--   'brick',
--   'all',
--   20,
--   0.22
-- );