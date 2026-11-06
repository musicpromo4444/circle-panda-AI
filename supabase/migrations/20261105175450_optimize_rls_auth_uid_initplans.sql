-- Cache auth.uid() once per statement in RLS expressions.
-- This preserves the existing policy predicates, roles and permissive/restrictive mode.
DO $rls$
DECLARE
  r record;
  v_roles text;
  v_sql text;
  v_using text;
  v_check text;
BEGIN
  FOR r IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND qual ~* 'auth\.uid\(\)')
        OR (with_check IS NOT NULL AND with_check ~* 'auth\.uid\(\)')
      )
  LOOP
    SELECT string_agg(
      CASE WHEN role_name = 'public' THEN 'PUBLIC' ELSE format('%I', role_name) END,
      ', '
    )
    INTO v_roles
    FROM unnest(r.roles) AS role_name;

    v_using := CASE WHEN r.qual IS NULL THEN NULL
      ELSE regexp_replace(r.qual, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi')
    END;
    v_check := CASE WHEN r.with_check IS NULL THEN NULL
      ELSE regexp_replace(r.with_check, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi')
    END;

    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    v_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd, v_roles
    );
    IF v_using IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_using);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;
    EXECUTE v_sql;
  END LOOP;
END;
$rls$;
