-- Alpha 5.17H4A
-- Preserve the existing entry_relationships type constraint and extend it
-- to accept the human-readable relationship labels produced by H4.

DO $$
DECLARE
  existing_constraint_definition text;
  existing_expression text;
BEGIN
  SELECT pg_get_constraintdef(constraint_row.oid)
  INTO existing_constraint_definition
  FROM pg_constraint AS constraint_row
  JOIN pg_class AS table_row
    ON table_row.oid = constraint_row.conrelid
  JOIN pg_namespace AS namespace_row
    ON namespace_row.oid = table_row.relnamespace
  WHERE namespace_row.nspname = 'public'
    AND table_row.relname = 'entry_relationships'
    AND constraint_row.conname = 'entry_relationships_type_check'
    AND constraint_row.contype = 'c';

  IF existing_constraint_definition IS NULL THEN
    RAISE EXCEPTION
      'Could not find public.entry_relationships constraint entry_relationships_type_check.';
  END IF;

  -- pg_get_constraintdef returns CHECK (<expression>).
  -- Keep the original expression and add the H4 values as an OR clause.
  existing_expression := regexp_replace(
    existing_constraint_definition,
    '^CHECK \\((.*)\\)$',
    '\\1'
  );

  ALTER TABLE public.entry_relationships
    DROP CONSTRAINT entry_relationships_type_check;

  EXECUTE format(
    $constraint$
      ALTER TABLE public.entry_relationships
      ADD CONSTRAINT entry_relationships_type_check
      CHECK (
        (%s)
        OR lower(trim(type)) IN (
          'similar meaning',
          'opposite',
          'variation',
          'natural response',
          'contextually related',
          'broader term',
          'narrower term',
          'similar_meaning',
          'natural_response',
          'contextually_related',
          'broader_term',
          'narrower_term'
        )
      )
    $constraint$,
    existing_expression
  );
END;
$$;

COMMENT ON CONSTRAINT entry_relationships_type_check
ON public.entry_relationships IS
  'Allows existing graph relationship types plus Alpha 5.17H4 AI relationship labels.';

NOTIFY pgrst, 'reload schema';
