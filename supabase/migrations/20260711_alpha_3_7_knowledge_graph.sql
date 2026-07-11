-- ============================================================
-- YERRR Studio
-- Alpha 3.7A — Supabase Knowledge Graph Schema
--
-- Creates/upgrades:
--   public.concepts
--   public.entry_concepts
--   public.entry_relationships
--   public.knowledge_graph_summary
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- Shared updated_at trigger function
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Concepts
--
-- The table may already exist with the older columns:
-- id, name, description, created_at
-- ============================================================

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

-- Add newer Knowledge Graph fields without deleting old data.

alter table public.concepts
  add column if not exists slug text;

alter table public.concepts
  add column if not exists category text default 'Meaning';

alter table public.concepts
  add column if not exists color text default 'yellow';

alter table public.concepts
  add column if not exists updated_at timestamptz default now();

-- Normalize old/null values.

update public.concepts
set description = ''
where description is null;

update public.concepts
set category = 'Meaning'
where category is null
   or trim(category) = ''
   or category not in (
     'Meaning',
     'Culture',
     'Place',
     'Action',
     'Emotion',
     'Identity',
     'Food',
     'Sound',
     'Social',
     'Other'
   );

update public.concepts
set color = 'yellow'
where color is null
   or trim(color) = ''
   or color not in (
     'yellow',
     'blue',
     'purple',
     'green',
     'red',
     'pink',
     'orange',
     'zinc'
   );

update public.concepts
set updated_at = coalesce(created_at, now())
where updated_at is null;

-- Generate slugs for existing rows.
-- Duplicate names receive a UUID suffix so every slug stays unique.

with normalized as (
  select
    id,
    coalesce(
      nullif(
        trim(
          both '-'
          from regexp_replace(
            lower(trim(coalesce(name, 'concept'))),
            '[^a-z0-9]+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'concept'
    ) as base_slug
  from public.concepts
  where slug is null or trim(slug) = ''
),
ranked as (
  select
    id,
    base_slug,
    row_number() over (
      partition by lower(base_slug)
      order by id
    ) as duplicate_number
  from normalized
)
update public.concepts as concept
set slug = case
  when ranked.duplicate_number = 1
    and not exists (
      select 1
      from public.concepts as existing
      where existing.id <> ranked.id
        and existing.slug is not null
        and trim(existing.slug) <> ''
        and lower(existing.slug) = lower(ranked.base_slug)
    )
  then ranked.base_slug
  else ranked.base_slug || '-' || ranked.id::text
end
from ranked
where concept.id = ranked.id;

-- Apply defaults and required-column rules.

alter table public.concepts
  alter column description set default '',
  alter column description set not null,
  alter column slug set not null,
  alter column category set default 'Meaning',
  alter column category set not null,
  alter column color set default 'yellow',
  alter column color set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

-- Add constraints only when missing.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'concepts_name_not_empty'
      and conrelid = 'public.concepts'::regclass
  ) then
    alter table public.concepts
      add constraint concepts_name_not_empty
      check (length(trim(name)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'concepts_slug_not_empty'
      and conrelid = 'public.concepts'::regclass
  ) then
    alter table public.concepts
      add constraint concepts_slug_not_empty
      check (length(trim(slug)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'concepts_category_check'
      and conrelid = 'public.concepts'::regclass
  ) then
    alter table public.concepts
      add constraint concepts_category_check
      check (
        category in (
          'Meaning',
          'Culture',
          'Place',
          'Action',
          'Emotion',
          'Identity',
          'Food',
          'Sound',
          'Social',
          'Other'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'concepts_color_check'
      and conrelid = 'public.concepts'::regclass
  ) then
    alter table public.concepts
      add constraint concepts_color_check
      check (
        color in (
          'yellow',
          'blue',
          'purple',
          'green',
          'red',
          'pink',
          'orange',
          'zinc'
        )
      );
  end if;
end;
$$;

-- Concept indexes.

create unique index if not exists concepts_slug_unique_index
  on public.concepts (lower(slug));

create index if not exists concepts_name_index
  on public.concepts (lower(name));

create index if not exists concepts_category_index
  on public.concepts (category);

-- Concept updated_at trigger.

drop trigger if exists concepts_set_updated_at
  on public.concepts;

create trigger concepts_set_updated_at
before update on public.concepts
for each row
execute function public.set_updated_at();

-- ============================================================
-- Detect the type of entries.id
--
-- This allows the graph tables to match your current entries
-- table whether its ID is UUID, bigint, text, etc.
-- ============================================================

do $$
declare
  entry_id_type text;
begin
  if to_regclass('public.entries') is null then
    raise exception
      'The public.entries table was not found. The Knowledge Graph migration requires public.entries.';
  end if;

  select format_type(attribute.atttypid, attribute.atttypmod)
  into entry_id_type
  from pg_attribute as attribute
  where attribute.attrelid = 'public.entries'::regclass
    and attribute.attname = 'id'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if entry_id_type is null then
    raise exception
      'The public.entries table does not contain an id column.';
  end if;

  -- ==========================================================
  -- Entry ↔ Concept assignments
  -- ==========================================================

  execute format(
    $table$
      create table if not exists public.entry_concepts (
        id uuid primary key default gen_random_uuid(),

        entry_id %s not null,
        concept_id uuid not null,

        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),

        constraint entry_concepts_entry_foreign_key
          foreign key (entry_id)
          references public.entries(id)
          on delete cascade,

        constraint entry_concepts_concept_foreign_key
          foreign key (concept_id)
          references public.concepts(id)
          on delete cascade,

        constraint entry_concepts_unique_assignment
          unique (entry_id, concept_id)
      )
    $table$,
    entry_id_type
  );

  -- ==========================================================
  -- Entry ↔ Entry relationships
  -- ==========================================================

  execute format(
    $table$
      create table if not exists public.entry_relationships (
        id uuid primary key default gen_random_uuid(),

        source_entry_id %s not null,
        target_entry_id %s not null,

        relationship_type text not null default 'Related To',
        note text not null default '',
        is_bidirectional boolean not null default false,

        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),

        constraint entry_relationships_source_foreign_key
          foreign key (source_entry_id)
          references public.entries(id)
          on delete cascade,

        constraint entry_relationships_target_foreign_key
          foreign key (target_entry_id)
          references public.entries(id)
          on delete cascade,

        constraint entry_relationships_no_self_link
          check (source_entry_id <> target_entry_id),

        constraint entry_relationships_type_check
          check (
            relationship_type in (
              'Related To',
              'Synonym Of',
              'Opposite Of',
              'Stronger Than',
              'Softer Than',
              'Phrase Version Of',
              'Regional Variant Of',
              'Derived From',
              'Used With'
            )
          )
      )
    $table$,
    entry_id_type,
    entry_id_type
  );
end;
$$;

-- ============================================================
-- Entry concept indexes and trigger
-- ============================================================

create index if not exists entry_concepts_entry_id_index
  on public.entry_concepts (entry_id);

create index if not exists entry_concepts_concept_id_index
  on public.entry_concepts (concept_id);

drop trigger if exists entry_concepts_set_updated_at
  on public.entry_concepts;

create trigger entry_concepts_set_updated_at
before update on public.entry_concepts
for each row
execute function public.set_updated_at();

-- ============================================================
-- Entry relationship indexes and trigger
-- ============================================================

create index if not exists entry_relationships_source_index
  on public.entry_relationships (source_entry_id);

create index if not exists entry_relationships_target_index
  on public.entry_relationships (target_entry_id);

create index if not exists entry_relationships_type_index
  on public.entry_relationships (relationship_type);

-- Directional relationships:
-- A → B is different from B → A.

create unique index if not exists
  entry_relationships_directional_unique
on public.entry_relationships (
  source_entry_id,
  target_entry_id,
  relationship_type
)
where is_bidirectional = false;

-- Two-way relationships:
-- A ↔ B is treated the same as B ↔ A.

create unique index if not exists
  entry_relationships_bidirectional_unique
on public.entry_relationships (
  least(source_entry_id, target_entry_id),
  greatest(source_entry_id, target_entry_id),
  relationship_type
)
where is_bidirectional = true;

drop trigger if exists entry_relationships_set_updated_at
  on public.entry_relationships;

create trigger entry_relationships_set_updated_at
before update on public.entry_relationships
for each row
execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.concepts enable row level security;
alter table public.entry_concepts enable row level security;
alter table public.entry_relationships enable row level security;

-- ------------------------------------------------------------
-- Concepts policies
-- ------------------------------------------------------------

drop policy if exists
  "Authenticated users can read concepts"
  on public.concepts;

create policy
  "Authenticated users can read concepts"
on public.concepts
for select
to authenticated
using (true);

drop policy if exists
  "Authenticated users can create concepts"
  on public.concepts;

create policy
  "Authenticated users can create concepts"
on public.concepts
for insert
to authenticated
with check (true);

drop policy if exists
  "Authenticated users can update concepts"
  on public.concepts;

create policy
  "Authenticated users can update concepts"
on public.concepts
for update
to authenticated
using (true)
with check (true);

drop policy if exists
  "Authenticated users can delete concepts"
  on public.concepts;

create policy
  "Authenticated users can delete concepts"
on public.concepts
for delete
to authenticated
using (true);

-- ------------------------------------------------------------
-- Entry-concept policies
-- ------------------------------------------------------------

drop policy if exists
  "Authenticated users can read entry concepts"
  on public.entry_concepts;

create policy
  "Authenticated users can read entry concepts"
on public.entry_concepts
for select
to authenticated
using (true);

drop policy if exists
  "Authenticated users can create entry concepts"
  on public.entry_concepts;

create policy
  "Authenticated users can create entry concepts"
on public.entry_concepts
for insert
to authenticated
with check (true);

drop policy if exists
  "Authenticated users can update entry concepts"
  on public.entry_concepts;

create policy
  "Authenticated users can update entry concepts"
on public.entry_concepts
for update
to authenticated
using (true)
with check (true);

drop policy if exists
  "Authenticated users can delete entry concepts"
  on public.entry_concepts;

create policy
  "Authenticated users can delete entry concepts"
on public.entry_concepts
for delete
to authenticated
using (true);

-- ------------------------------------------------------------
-- Entry relationship policies
-- ------------------------------------------------------------

drop policy if exists
  "Authenticated users can read entry relationships"
  on public.entry_relationships;

create policy
  "Authenticated users can read entry relationships"
on public.entry_relationships
for select
to authenticated
using (true);

drop policy if exists
  "Authenticated users can create entry relationships"
  on public.entry_relationships;

create policy
  "Authenticated users can create entry relationships"
on public.entry_relationships
for insert
to authenticated
with check (true);

drop policy if exists
  "Authenticated users can update entry relationships"
  on public.entry_relationships;

create policy
  "Authenticated users can update entry relationships"
on public.entry_relationships
for update
to authenticated
using (true)
with check (true);

drop policy if exists
  "Authenticated users can delete entry relationships"
  on public.entry_relationships;

create policy
  "Authenticated users can delete entry relationships"
on public.entry_relationships
for delete
to authenticated
using (true);

-- ============================================================
-- Authenticated-role permissions
-- ============================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete
  on public.concepts
  to authenticated;

grant select, insert, update, delete
  on public.entry_concepts
  to authenticated;

grant select, insert, update, delete
  on public.entry_relationships
  to authenticated;

-- ============================================================
-- Knowledge Graph summary view
-- ============================================================

create or replace view public.knowledge_graph_summary
with (security_invoker = true)
as
select
  (
    select count(*)
    from public.concepts
  ) as concept_count,

  (
    select count(distinct entry_id)
    from public.entry_concepts
  ) as entries_with_concepts,

  (
    select count(*)
    from public.entry_concepts
  ) as concept_link_count,

  (
    select count(*)
    from public.entry_relationships
  ) as relationship_count,

  (
    select count(*)
    from (
      select source_entry_id as entry_id
      from public.entry_relationships

      union

      select target_entry_id as entry_id
      from public.entry_relationships
    ) as related_entries
  ) as entries_with_relationships;

grant select
  on public.knowledge_graph_summary
  to authenticated;

commit;