/*
  # Rewire cont_post_cogs_from_inv to Contabilidad PRO GL

  - Reads daily COGS from public.v_cogs_dia_norm (normalized view of vw_cogs_diarios).
  - Posts balanced debit/credit pairs into contabilidad_journal + contabilidad_journal_line.
  - Stops writing into legacy cont_journal/cont_entry tables.
*/

CREATE OR REPLACE FUNCTION public.cont_post_cogs_from_inv(
  p_desde date,
  p_hasta date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE(
  journal_id uuid,
  journal_date date,
  sucursal_id uuid,
  cogs numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  v_cogs_account text;
  v_inventory_account text;
  v_journal_id uuid;
  v_desc text;
  v_source_id text;
BEGIN
  IF p_desde IS NULL OR p_hasta IS NULL THEN
    RAISE EXCEPTION 'El rango de fechas es obligatorio (desde %, hasta %).', p_desde, p_hasta;
  END IF;

  -- Resolve the COGS and inventory account codes from cont_account.
  SELECT ca.code
  INTO v_cogs_account
  FROM public.cont_account ca
  WHERE ca.code = '5.1.1'
  LIMIT 1;

  IF v_cogs_account IS NULL THEN
    SELECT ca.code
    INTO v_cogs_account
    FROM public.cont_account ca
    WHERE lower(ca.type) = 'cogs'
    ORDER BY ca.code
    LIMIT 1;
  END IF;

  IF v_cogs_account IS NULL THEN
    RAISE EXCEPTION 'No se encontró cuenta de COGS (code 5.1.1) en cont_account.';
  END IF;

  SELECT ca.code
  INTO v_inventory_account
  FROM public.cont_account ca
  WHERE ca.code = '1.3.1'
  LIMIT 1;

  IF v_inventory_account IS NULL THEN
    SELECT ca.code
    INTO v_inventory_account
    FROM public.cont_account ca
    WHERE lower(ca.type) = 'asset'
    ORDER BY ca.code
    LIMIT 1;
  END IF;

  IF v_inventory_account IS NULL THEN
    RAISE EXCEPTION 'No se encontró cuenta de inventario (code 1.3.1) en cont_account.';
  END IF;

  FOR rec IN
    SELECT
      fecha,
      sucursal_id,
      ROUND(SUM(cogs)::numeric, 2) AS cogs_sum
    FROM public.v_cogs_dia_norm
    WHERE fecha BETWEEN p_desde AND p_hasta
      AND (p_sucursal_id IS NULL OR sucursal_id = p_sucursal_id)
    GROUP BY fecha, sucursal_id
    HAVING ROUND(SUM(cogs)::numeric, 2) <> 0
    ORDER BY fecha, sucursal_id
  LOOP
    v_desc := 'COGS ' || COALESCE(rec.sucursal_id::text, 'CONSOLIDADO') || ' ' || rec.fecha::text;
    v_source_id := 'cogs:' || rec.fecha::text || ':' || COALESCE(rec.sucursal_id::text, 'all');

    SELECT cj.id
    INTO v_journal_id
    FROM public.contabilidad_journal cj
    WHERE cj.journal_date = rec.fecha
      AND cj.description = v_desc
      AND cj.source = 'cogs'
      AND (cj.sucursal_id IS NOT DISTINCT FROM rec.sucursal_id)
    LIMIT 1;

    IF NOT FOUND THEN
      v_journal_id := gen_random_uuid();

      INSERT INTO public.contabilidad_journal (
        id,
        journal_date,
        description,
        source,
        source_id,
        sucursal_id,
        total_debit,
        total_credit,
        created_at
      ) VALUES (
        v_journal_id,
        rec.fecha,
        v_desc,
        'cogs',
        v_source_id,
        rec.sucursal_id,
        rec.cogs_sum,
        rec.cogs_sum,
        now()
      );
    ELSE
      -- Remove previous COGS lines inserted by this routine before recalculating.
      DELETE FROM public.contabilidad_journal_line
      WHERE journal_id = v_journal_id
        AND (
          account_id IN (v_cogs_account, v_inventory_account)
          OR (meta->>'origin') = 'cont_post_cogs_from_inv'
        );

      UPDATE public.contabilidad_journal
      SET source_id = v_source_id,
          description = v_desc
      WHERE id = v_journal_id;
    END IF;

    INSERT INTO public.contabilidad_journal_line (journal_id, account_id, debit, credit, meta)
    VALUES (
      v_journal_id,
      v_cogs_account,
      rec.cogs_sum,
      0,
      jsonb_build_object('origin', 'cont_post_cogs_from_inv', 'side', 'debit')
    );

    INSERT INTO public.contabilidad_journal_line (journal_id, account_id, debit, credit, meta)
    VALUES (
      v_journal_id,
      v_inventory_account,
      0,
      rec.cogs_sum,
      jsonb_build_object('origin', 'cont_post_cogs_from_inv', 'side', 'credit')
    );

    UPDATE public.contabilidad_journal cj
    SET total_debit = totals.debit,
        total_credit = totals.credit
    FROM (
      SELECT
        journal_id,
        COALESCE(SUM(debit), 0) AS debit,
        COALESCE(SUM(credit), 0) AS credit
      FROM public.contabilidad_journal_line
      WHERE journal_id = v_journal_id
      GROUP BY journal_id
    ) totals
    WHERE cj.id = v_journal_id;

    journal_id := v_journal_id;
    journal_date := rec.fecha;
    sucursal_id := rec.sucursal_id;
    cogs := rec.cogs_sum;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;
