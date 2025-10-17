/*
  # Fix Sales Posting Function

  ## Summary
  Fixes the api_post_sales_to_gl function to correctly handle the ventas table structure
  which doesn't have a separate subtotal column - it needs to be calculated from total - itbms.

  ## Changes
  - Calculate subtotal as (total - itbms) for ventas table
  - Match the structure with invu_ventas handling
*/

CREATE OR REPLACE FUNCTION public.api_post_sales_to_gl(
  desde date,
  hasta date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE (
  journal_id uuid,
  source text,
  ref text,
  date date,
  sucursal_id uuid,
  total_amount numeric,
  entry_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_id uuid;
  v_settings jsonb;
  v_income_account uuid;
  v_itbms_account uuid;
  v_cash_account uuid;
  v_subtotal numeric;
  v_itbms numeric;
  v_total numeric;
  v_ref text;
  v_memo text;
  rec RECORD;
BEGIN
  -- Combine sales from both sources: invu_ventas (API) and ventas (CSV)
  FOR rec IN (
    -- INVU API sales
    SELECT 
      'INVU' AS source,
      iv.fecha,
      iv.sucursal_id,
      COALESCE(SUM(iv.total - iv.itbms), 0) AS subtotal,
      COALESCE(SUM(iv.itbms), 0) AS itbms,
      COALESCE(SUM(iv.total), 0) AS total,
      COUNT(*) AS transaction_count
    FROM public.invu_ventas iv
    WHERE 
      iv.fecha >= desde 
      AND iv.fecha <= hasta
      AND (p_sucursal_id IS NULL OR iv.sucursal_id = p_sucursal_id)
    GROUP BY iv.fecha, iv.sucursal_id
    
    UNION ALL
    
    -- CSV imported sales (ventas table structure: total, itbms, propinas)
    SELECT 
      'CSV' AS source,
      v.fecha,
      v.sucursal_id,
      COALESCE(SUM(v.total - v.itbms), 0) AS subtotal,
      COALESCE(SUM(v.itbms), 0) AS itbms,
      COALESCE(SUM(v.total), 0) AS total,
      COUNT(*) AS transaction_count
    FROM public.ventas v
    WHERE 
      v.fecha >= desde 
      AND v.fecha <= hasta
      AND (p_sucursal_id IS NULL OR v.sucursal_id = p_sucursal_id)
      AND v.sucursal_id IS NOT NULL
    GROUP BY v.fecha, v.sucursal_id
    
    ORDER BY fecha, sucursal_id, source
  ) LOOP
    -- Skip if no sales
    CONTINUE WHEN rec.total = 0;
    
    -- Get account mapping for this sucursal
    SELECT value INTO v_settings
    FROM public.app_settings
    WHERE scope = 'sucursal' 
      AND sucursal_id = rec.sucursal_id 
      AND key = 'map_sales'
    LIMIT 1;
    
    -- Skip if no mapping configured
    IF v_settings IS NULL THEN
      RAISE NOTICE 'No sales mapping configured for sucursal %', rec.sucursal_id;
      CONTINUE;
    END IF;
    
    -- Extract account UUIDs from settings
    v_income_account := (v_settings->>'income_account')::uuid;
    v_itbms_account := (v_settings->>'itbms_sales_account')::uuid;
    v_cash_account := (v_settings->>'cash_bank_account')::uuid;
    
    -- Validate required accounts
    IF v_income_account IS NULL OR v_itbms_account IS NULL OR v_cash_account IS NULL THEN
      RAISE NOTICE 'Incomplete mapping for sucursal %. Required: income_account, itbms_sales_account, cash_bank_account', rec.sucursal_id;
      CONTINUE;
    END IF;
    
    -- Generate reference and memo
    v_ref := 'SALES-' || TO_CHAR(rec.fecha, 'YYYYMMDD') || '-' || rec.sucursal_id;
    v_memo := rec.source || ' sales for ' || TO_CHAR(rec.fecha, 'YYYY-MM-DD') || ' (' || rec.transaction_count || ' transactions)';
    
    -- Create journal entry (idempotent with ON CONFLICT)
    INSERT INTO public.gl_journal (
      sucursal_id, source, ref, memo, date, posted_by
    )
    VALUES (
      rec.sucursal_id, rec.source, v_ref, v_memo, rec.fecha, auth.uid()
    )
    ON CONFLICT (source, ref, date, sucursal_id) DO NOTHING
    RETURNING id INTO v_journal_id;
    
    -- Skip if journal already exists (idempotent)
    CONTINUE WHEN v_journal_id IS NULL;
    
    -- DR: Cash/Bank (total)
    INSERT INTO public.gl_entry (journal_id, account_id, debit, credit, memo)
    VALUES (v_journal_id, v_cash_account, rec.total, 0, 'Cash from sales');
    
    -- CR: Sales Revenue (subtotal)
    INSERT INTO public.gl_entry (journal_id, account_id, debit, credit, memo)
    VALUES (v_journal_id, v_income_account, 0, rec.subtotal, 'Sales revenue');
    
    -- CR: ITBMS Payable (tax)
    IF rec.itbms > 0 THEN
      INSERT INTO public.gl_entry (journal_id, account_id, debit, credit, memo)
      VALUES (v_journal_id, v_itbms_account, 0, rec.itbms, 'Sales tax collected');
    END IF;
    
    -- Return created journal info
    RETURN QUERY
    SELECT 
      v_journal_id,
      rec.source,
      v_ref,
      rec.fecha,
      rec.sucursal_id,
      rec.total,
      3::int;
  END LOOP;
  
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.api_post_sales_to_gl IS 'Post sales from both INVU API and CSV imports to general ledger - calculates subtotal from (total - itbms)';
