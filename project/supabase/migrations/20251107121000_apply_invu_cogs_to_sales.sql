/*
  # Wire INVU COGS into sales posting

  - Helper functions to resolve automatic accounts and apply INVU COGS per journal.
  - Wrap cont_post_sales_from_norm_view to invoke the helper after posting.
  - Backfill existing sales journals with real COGS.
*/

CREATE OR REPLACE FUNCTION public.cont_resolve_auto_account(p_keys text[])
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
BEGIN
  IF p_keys IS NULL OR array_length(p_keys, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT cam.account_code
  INTO v_code
  FROM public.cont_account_auto_map cam
  WHERE cam.origen = ANY(p_keys)
  ORDER BY array_position(p_keys, cam.origen)
  LIMIT 1;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.cont_apply_invu_cogs_to_sales_journal(
  p_journal_id uuid,
  p_force boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_journal record;
  v_cogs numeric := 0;
  v_cogs_account text;
  v_inventory_account text;
  v_rows int := 0;
BEGIN
  SELECT *
  INTO v_journal
  FROM public.contabilidad_journal
  WHERE id = p_journal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF lower(COALESCE(v_journal.source, '')) <> 'ventas' THEN
    RETURN FALSE;
  END IF;

  SELECT c.cogs_real_dia
  INTO v_cogs
  FROM public.v_invu_cogs_diario_sucursal c
  WHERE c.fecha = v_journal.journal_date
    AND (
      (c.sucursal_id IS NULL AND v_journal.sucursal_id IS NULL)
      OR (c.sucursal_id = v_journal.sucursal_id)
    );

  v_cogs := COALESCE(v_cogs, 0);

  IF v_cogs <= 0 AND NOT p_force THEN
    -- No COGS to post; ensure any previous INVU COGS lines are removed
    DELETE FROM public.contabilidad_journal_line
    WHERE journal_id = v_journal.id
      AND meta->>'origin' = 'invu_cogs';

    UPDATE public.contabilidad_journal cj
    SET total_debit = totals.debit,
        total_credit = totals.credit
    FROM (
      SELECT journal_id,
        COALESCE(SUM(debit), 0) AS debit,
        COALESCE(SUM(credit), 0) AS credit
      FROM public.contabilidad_journal_line
      WHERE journal_id = v_journal.id
      GROUP BY journal_id
    ) totals
    WHERE cj.id = v_journal.id;

    RETURN FALSE;
  END IF;

  v_cogs_account := public.cont_resolve_auto_account(ARRAY['ventas_cogs', 'ventas_cogs_account', 'cogs_ventas', 'ventas_costo']);
  IF v_cogs_account IS NULL THEN
    SELECT ca.code
    INTO v_cogs_account
    FROM public.cont_account ca
    WHERE lower(ca.type) IN ('cogs', 'expense')
    ORDER BY CASE WHEN lower(ca.type) = 'cogs' THEN 0 ELSE 1 END, ca.code
    LIMIT 1;
  END IF;

  IF v_cogs_account IS NULL THEN
    RAISE EXCEPTION 'No se encontró cuenta de COGS para ventas. Configura cont_account_auto_map (ventas_cogs) o un tipo COGS.';
  END IF;

  v_inventory_account := public.cont_resolve_auto_account(ARRAY['ventas_inventario', 'inventario', 'inventory', 'ventas_inventory']);
  IF v_inventory_account IS NULL THEN
    SELECT ca.code
    INTO v_inventory_account
    FROM public.cont_account ca
    WHERE lower(ca.type) = 'asset'
      AND (lower(ca.name) LIKE '%invent%' OR lower(ca.code) LIKE '1%')
    ORDER BY CASE WHEN lower(ca.name) LIKE '%invent%' THEN 0 ELSE 1 END, ca.code
    LIMIT 1;
  END IF;

  IF v_inventory_account IS NULL THEN
    RAISE EXCEPTION 'No se encontró cuenta de inventario para ventas. Configura cont_account_auto_map (ventas_inventario).';
  END IF;

  -- Upsert debit line (COGS)
  INSERT INTO public.contabilidad_journal_line (journal_id, account_id, debit, credit, meta)
  VALUES (
    v_journal.id,
    v_cogs_account,
    v_cogs,
    0,
    jsonb_build_object('origin', 'invu_cogs', 'kind', 'cogs', 'side', 'debit')
  )
  ON CONFLICT DO NOTHING;

  -- Update if exists with different amount
  UPDATE public.contabilidad_journal_line
  SET debit = v_cogs,
      credit = 0,
      meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('origin', 'invu_cogs', 'kind', 'cogs', 'side', 'debit')
  WHERE journal_id = v_journal.id
    AND (meta->>'origin') = 'invu_cogs'
    AND (meta->>'side') = 'debit';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Ensure amount updated even if meta was missing
    UPDATE public.contabilidad_journal_line
    SET debit = v_cogs,
        credit = 0,
        meta = jsonb_build_object('origin', 'invu_cogs', 'kind', 'cogs', 'side', 'debit')
    WHERE journal_id = v_journal.id
      AND account_id = v_cogs_account
      AND credit = 0
      AND debit <> v_cogs;
  END IF;

  -- Upsert credit line (inventory offset)
  INSERT INTO public.contabilidad_journal_line (journal_id, account_id, debit, credit, meta)
  VALUES (
    v_journal.id,
    v_inventory_account,
    0,
    v_cogs,
    jsonb_build_object('origin', 'invu_cogs', 'kind', 'inventory_offset', 'side', 'credit')
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.contabilidad_journal_line
  SET debit = 0,
      credit = v_cogs,
      meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('origin', 'invu_cogs', 'kind', 'inventory_offset', 'side', 'credit')
  WHERE journal_id = v_journal.id
    AND (meta->>'origin') = 'invu_cogs'
    AND (meta->>'side') = 'credit';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    UPDATE public.contabilidad_journal_line
    SET debit = 0,
        credit = v_cogs,
        meta = jsonb_build_object('origin', 'invu_cogs', 'kind', 'inventory_offset', 'side', 'credit')
    WHERE journal_id = v_journal.id
      AND account_id = v_inventory_account
      AND debit = 0
      AND credit <> v_cogs;
  END IF;

  UPDATE public.contabilidad_journal cj
  SET total_debit = totals.debit,
      total_credit = totals.credit
  FROM (
    SELECT journal_id,
      COALESCE(SUM(debit), 0) AS debit,
      COALESCE(SUM(credit), 0) AS credit
    FROM public.contabilidad_journal_line
    WHERE journal_id = v_journal.id
    GROUP BY journal_id
  ) totals
  WHERE cj.id = v_journal.id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.cont_apply_invu_cogs_for_range(
  p_desde date,
  p_hasta date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  rec record;
  v_count integer := 0;
BEGIN
  FOR rec IN
    SELECT id
    FROM public.contabilidad_journal
    WHERE lower(COALESCE(source, '')) = 'ventas'
      AND journal_date BETWEEN p_desde AND p_hasta
      AND (p_sucursal_id IS NULL OR sucursal_id = p_sucursal_id)
  LOOP
    IF public.cont_apply_invu_cogs_to_sales_journal(rec.id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cont_apply_invu_cogs_for_month(
  p_mes text,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_start date;
  v_end date;
BEGIN
  IF p_mes IS NULL OR length(p_mes) < 7 THEN
    RAISE EXCEPTION 'Mes inválido para COGS INVU: %', p_mes;
  END IF;

  v_start := to_date(substr(p_mes, 1, 7) || '-01', 'YYYY-MM-DD');
  v_end := (date_trunc('month', v_start) + INTERVAL '1 month - 1 day')::date;

  RETURN public.cont_apply_invu_cogs_for_range(v_start, v_end, p_sucursal_id);
END;
$$;

DO $$
DECLARE
  rec RECORD;
  idx integer := 1;
BEGIN
  CREATE TEMP TABLE tmp_sales_posting_wrapper (
    idx integer,
    identity_args text,
    arg_defs text,
    result_type text,
    arg_names text[],
    arg_types oid[]
  ) ON COMMIT DROP;

  FOR rec IN
    SELECT
      p.oid,
      pg_get_function_identity_arguments(p.oid) AS identity_args,
      pg_get_function_arguments(p.oid) AS arg_defs,
      pg_get_function_result(p.oid) AS result_type,
      p.proargnames AS arg_names,
      p.proargtypes AS arg_types
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cont_post_sales_from_norm_view'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.cont_post_sales_from_norm_view(%s) RENAME TO cont_post_sales_from_norm_view_base_%s',
      rec.identity_args,
      idx
    );

    INSERT INTO tmp_sales_posting_wrapper
      (idx, identity_args, arg_defs, result_type, arg_names, arg_types)
    VALUES
      (idx, rec.identity_args, rec.arg_defs, rec.result_type, rec.arg_names, rec.arg_types);

    idx := idx + 1;
  END LOOP;

  FOR rec IN SELECT * FROM tmp_sales_posting_wrapper LOOP
    DECLARE
      call_args text := '';
      assign_blocks text := '';
      i integer;
      arg_name text;
      arg_count integer;
      body text := '';
      header text;
      result_type text := COALESCE(rec.result_type, 'void');
      arg_defs text := COALESCE(rec.arg_defs, '');
      is_setof boolean := false;
      is_table boolean := false;
    BEGIN
      IF rec.arg_names IS NOT NULL THEN
        arg_count := array_length(rec.arg_names, 1);
      ELSE
        arg_count := COALESCE(array_length(rec.arg_types, 1), 0);
      END IF;

      IF arg_count IS NULL THEN
        arg_count := 0;
      END IF;

      FOR i IN 1..arg_count LOOP
        IF i > 1 THEN
          call_args := call_args || ', ';
        END IF;

        IF rec.arg_names IS NOT NULL AND rec.arg_names[i] IS NOT NULL AND rec.arg_names[i] <> '' THEN
          arg_name := rec.arg_names[i];
          call_args := call_args || format('%I', arg_name);

          IF lower(arg_name) LIKE '%mes%' THEN
            assign_blocks := assign_blocks || format('  v_mes := COALESCE(v_mes, %I::text);%s', arg_name, E'\n');
          ELSIF lower(arg_name) LIKE '%desde%' THEN
            assign_blocks := assign_blocks || format(
              '  IF %I IS NOT NULL THEN v_mes := COALESCE(v_mes, to_char(date_trunc(''month'', %I::date), ''YYYY-MM'')); END IF;%s',
              arg_name,
              arg_name,
              E'\n'
            );
          ELSIF lower(arg_name) LIKE '%hasta%' THEN
            assign_blocks := assign_blocks || format(
              '  IF %I IS NOT NULL THEN v_mes := COALESCE(v_mes, to_char(date_trunc(''month'', %I::date), ''YYYY-MM'')); END IF;%s',
              arg_name,
              arg_name,
              E'\n'
            );
          END IF;

          IF lower(arg_name) LIKE '%sucursal%' THEN
            assign_blocks := assign_blocks || format('  v_sucursal := COALESCE(v_sucursal, %I);%s', arg_name, E'\n');
          END IF;
        ELSE
          call_args := call_args || format('$%s', i);
        END IF;
      END LOOP;

      is_setof := lower(result_type) LIKE 'setof %';
      is_table := lower(result_type) LIKE 'table %';

      header := format(
        'CREATE OR REPLACE FUNCTION public.cont_post_sales_from_norm_view(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER AS $$',
        arg_defs,
        result_type
      );

      body := body || 'DECLARE' || E'\n';
      IF NOT is_setof AND NOT is_table AND lower(result_type) <> 'void' THEN
        body := body || format('  v_result %s;%s', result_type, E'\n');
      END IF;
      body := body || '  v_mes text := NULL;' || E'\n';
      body := body || '  v_sucursal uuid := NULL;' || E'\n';
      body := body || 'BEGIN' || E'\n';
      body := body || assign_blocks;

      IF lower(result_type) = 'void' THEN
        body := body || format('  PERFORM public.cont_post_sales_from_norm_view_base_%s(%s);%s', rec.idx, call_args, E'\n');
        body := body || '  IF v_mes IS NOT NULL THEN' || E'\n';
        body := body || '    PERFORM public.cont_apply_invu_cogs_for_month(v_mes, v_sucursal);' || E'\n';
        body := body || '  END IF;' || E'\n';
        body := body || '  RETURN;' || E'\n';
      ELSIF is_setof OR is_table THEN
        body := body || format('  RETURN QUERY SELECT * FROM public.cont_post_sales_from_norm_view_base_%s(%s);%s', rec.idx, call_args, E'\n');
        body := body || '  IF v_mes IS NOT NULL THEN' || E'\n';
        body := body || '    PERFORM public.cont_apply_invu_cogs_for_month(v_mes, v_sucursal);' || E'\n';
        body := body || '  END IF;' || E'\n';
      ELSE
        body := body || format('  v_result := public.cont_post_sales_from_norm_view_base_%s(%s);%s', rec.idx, call_args, E'\n');
        body := body || '  IF v_mes IS NOT NULL THEN' || E'\n';
        body := body || '    PERFORM public.cont_apply_invu_cogs_for_month(v_mes, v_sucursal);' || E'\n';
        body := body || '  END IF;' || E'\n';
        body := body || '  RETURN v_result;' || E'\n';
      END IF;

      body := body || 'END;' || E'\n';
      body := body || '$$;';

      EXECUTE header || E'\n' || body;
    END;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_min date;
  v_max date;
BEGIN
  SELECT MIN(journal_date), MAX(journal_date)
  INTO v_min, v_max
  FROM public.contabilidad_journal
  WHERE lower(COALESCE(source, '')) = 'ventas';

  IF v_min IS NOT NULL THEN
    PERFORM public.cont_apply_invu_cogs_for_range(v_min, v_max, NULL);
  END IF;
END;
$$;
