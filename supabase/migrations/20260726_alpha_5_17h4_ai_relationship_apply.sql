-- YERRR Studio
-- Alpha 5.17H4 — Apply approved AI relationship suggestions
--
-- This migration creates one authenticated RPC that:
-- 1. Detects the existing relationship table and common column names.
-- 2. Verifies both entry records belong to the signed-in user when entries.user_id exists.
-- 3. Prevents self-links and duplicate relationships.
-- 4. Inserts only an explicitly approved relationship.
--
-- Safe to rerun.

begin;

create or replace function public.apply_ai_entry_relationship(
  p_source_entry_id text,
  p_target_entry_id text,
  p_relationship_type text,
  p_strength integer default 5,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();

  v_relationship_table text;
  v_source_column text;
  v_target_column text;
  v_type_column text;
  v_strength_column text;
  v_notes_column text;
  v_user_column text;
  v_entry_user_column text;

  v_candidate text;
  v_entry_count integer := 0;
  v_existing jsonb;
  v_inserted jsonb;
  v_directional boolean;

  v_columns text;
  v_values text;
  v_duplicate_sql text;
  v_type_filter text := '';
begin
  if v_user_id is null then
    raise exception 'You must be signed in to apply a relationship.';
  end if;

  p_source_entry_id := nullif(btrim(coalesce(p_source_entry_id, '')), '');
  p_target_entry_id := nullif(btrim(coalesce(p_target_entry_id, '')), '');
  p_relationship_type := lower(
    nullif(btrim(coalesce(p_relationship_type, '')), '')
  );
  p_strength := least(greatest(coalesce(p_strength, 5), 1), 10);
  p_notes := left(btrim(coalesce(p_notes, '')), 4000);

  if p_source_entry_id is null or p_target_entry_id is null then
    raise exception 'Both source and target entry IDs are required.';
  end if;

  if p_source_entry_id = p_target_entry_id then
    raise exception 'An entry cannot be related to itself.';
  end if;

  if p_relationship_type is null or p_relationship_type not in (
    'similar_meaning',
    'opposite',
    'variation',
    'response',
    'contextually_related',
    'broader_term',
    'narrower_term'
  ) then
    raise exception 'Unsupported relationship type: %', p_relationship_type;
  end if;

  if to_regclass('public.entries') is null then
    raise exception 'public.entries does not exist.';
  end if;

  -- Find the current graph relationship table.
  foreach v_candidate in array array[
    'entry_relationships',
    'relationships',
    'graph_relationships'
  ]
  loop
    if to_regclass(format('public.%I', v_candidate)) is not null then
      v_relationship_table := v_candidate;
      exit;
    end if;
  end loop;

  if v_relationship_table is null then
    raise exception
      'No supported relationship table exists. Open Cloud Relationships and confirm the Knowledge Graph migration is installed.';
  end if;

  -- Detect relationship columns in priority order.
  select column_name
  into v_source_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = v_relationship_table
    and column_name = any(array[
      'source_entry_id',
      'from_entry_id',
      'source_id',
      'entry_id',
      'sourceEntryId'
    ])
  order by array_position(
    array[
      'source_entry_id',
      'from_entry_id',
      'source_id',
      'entry_id',
      'sourceEntryId'
    ],
    column_name
  )
  limit 1;

  select column_name
  into v_target_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = v_relationship_table
    and column_name = any(array[
      'target_entry_id',
      'to_entry_id',
      'target_id',
      'related_entry_id',
      'targetEntryId'
    ])
  order by array_position(
    array[
      'target_entry_id',
      'to_entry_id',
      'target_id',
      'related_entry_id',
      'targetEntryId'
    ],
    column_name
  )
  limit 1;

  select column_name
  into v_type_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = v_relationship_table
    and column_name = any(array[
      'relationship_type',
      'type',
      'kind',
      'relationship',
      'label'
    ])
  order by array_position(
    array[
      'relationship_type',
      'type',
      'kind',
      'relationship',
      'label'
    ],
    column_name
  )
  limit 1;

  select column_name
  into v_strength_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = v_relationship_table
    and column_name = any(array[
      'strength',
      'weight',
      'relationship_strength'
    ])
  order by array_position(
    array[
      'strength',
      'weight',
      'relationship_strength'
    ],
    column_name
  )
  limit 1;

  select column_name
  into v_notes_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = v_relationship_table
    and column_name = any(array[
      'notes',
      'description',
      'reason',
      'rationale'
    ])
  order by array_position(
    array[
      'notes',
      'description',
      'reason',
      'rationale'
    ],
    column_name
  )
  limit 1;

  select column_name
  into v_user_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = v_relationship_table
    and column_name = any(array[
      'user_id',
      'owner_id',
      'created_by'
    ])
  order by array_position(
    array[
      'user_id',
      'owner_id',
      'created_by'
    ],
    column_name
  )
  limit 1;

  if v_source_column is null or v_target_column is null then
    raise exception
      'The % table does not contain supported source and target entry columns.',
      v_relationship_table;
  end if;

  -- Verify the two entries exist and, when possible, belong to the current user.
  select column_name
  into v_entry_user_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'entries'
    and column_name = any(array[
      'user_id',
      'owner_id',
      'created_by'
    ])
  order by array_position(
    array[
      'user_id',
      'owner_id',
      'created_by'
    ],
    column_name
  )
  limit 1;

  if v_entry_user_column is not null then
    execute format(
      'select count(*) from public.entries where id::text in ($1, $2) and %I = $3',
      v_entry_user_column
    )
    using p_source_entry_id, p_target_entry_id, v_user_id
    into v_entry_count;
  else
    execute
      'select count(*) from public.entries where id::text in ($1, $2)'
    using p_source_entry_id, p_target_entry_id
    into v_entry_count;
  end if;

  if v_entry_count <> 2 then
    raise exception
      'Both relationship entries must exist and belong to the signed-in account.';
  end if;

  v_directional := p_relationship_type in (
    'response',
    'broader_term',
    'narrower_term'
  );

  if v_type_column is not null then
    v_type_filter := format(
      ' and lower(btrim(coalesce(r.%I::text, ''''))) = $3',
      v_type_column
    );
  end if;

  if v_directional then
    v_duplicate_sql := format(
      'select to_jsonb(r) from public.%I r where r.%I::text = $1 and r.%I::text = $2%s limit 1',
      v_relationship_table,
      v_source_column,
      v_target_column,
      v_type_filter
    );
  else
    v_duplicate_sql := format(
      'select to_jsonb(r) from public.%I r where ((r.%I::text = $1 and r.%I::text = $2) or (r.%I::text = $2 and r.%I::text = $1))%s limit 1',
      v_relationship_table,
      v_source_column,
      v_target_column,
      v_source_column,
      v_target_column,
      v_type_filter
    );
  end if;

  if v_type_column is not null then
    execute v_duplicate_sql
    using p_source_entry_id, p_target_entry_id, p_relationship_type
    into v_existing;
  else
    execute v_duplicate_sql
    using p_source_entry_id, p_target_entry_id
    into v_existing;
  end if;

  if v_existing is not null then
    return jsonb_build_object(
      'status', 'exists',
      'table', v_relationship_table,
      'relationship', v_existing
    );
  end if;

  v_columns := format('%I, %I', v_source_column, v_target_column);
  v_values := format('%L, %L', p_source_entry_id, p_target_entry_id);

  if v_type_column is not null then
    v_columns := v_columns || format(', %I', v_type_column);
    v_values := v_values || format(', %L', p_relationship_type);
  elsif v_notes_column is not null then
    p_notes := concat_ws(
      E'\n',
      format('Relationship type: %s', p_relationship_type),
      nullif(p_notes, '')
    );
  end if;

  if v_strength_column is not null then
    v_columns := v_columns || format(', %I', v_strength_column);
    v_values := v_values || format(', %L', p_strength);
  end if;

  if v_notes_column is not null then
    v_columns := v_columns || format(', %I', v_notes_column);
    v_values := v_values || format(', %L', p_notes);
  end if;

  if v_user_column is not null then
    v_columns := v_columns || format(', %I', v_user_column);
    v_values := v_values || format(', %L', v_user_id);
  end if;

  execute format(
    'insert into public.%I (%s) values (%s) returning to_jsonb(%I.*)',
    v_relationship_table,
    v_columns,
    v_values,
    v_relationship_table
  )
  into v_inserted;

  return jsonb_build_object(
    'status', 'created',
    'table', v_relationship_table,
    'relationship', v_inserted
  );
end;
$$;

revoke all
  on function public.apply_ai_entry_relationship(
    text,
    text,
    text,
    integer,
    text
  )
  from public;

grant execute
  on function public.apply_ai_entry_relationship(
    text,
    text,
    text,
    integer,
    text
  )
  to authenticated;

comment on function public.apply_ai_entry_relationship(
  text,
  text,
  text,
  integer,
  text
) is
  'Applies one human-approved YERRR Studio AI entry relationship after ownership and duplicate checks.';

commit;

notify pgrst, 'reload schema';
