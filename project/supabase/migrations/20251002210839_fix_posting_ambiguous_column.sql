/*
  # Fix Ambiguous Column Reference in Posting Functions

  ## Summary
  Fixes ambiguous column reference in api_post_sales_to_gl and api_post_purchases_to_gl
  by explicitly qualifying the table name in the WHERE clause.

  ## Changes
  - Change `sucursal_id = rec.sucursal_id` to `app_settings.sucursal_id = rec.sucursal_id`
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
      AND app_settings.sucursal_id = rec.sucursal_id 
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

-- Also fix the purchases function
CREATE OR REPLACE FUNCTION public.api_post_purchases_to_gl(
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
  vendor_name text,
  invoice_no text,
  total_amount numeric,
  entry_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_id uuid;
  v_settings jsonb;
  v_expense_account uuid;
  v_itbms_account uuid;
  v_ap_account uuid;
  v_ref text;
  v_memo text;
  rec RECORD;
BEGIN
  -- Process purchases from CSV
  FOR rec IN (
    SELECT 
      c.id,
      c.sucursal_id,
      c.proveedor,
      c.factura,
      c.fecha,
      c.subtotal,
      c.itbms,
      c.total,
      c.origen
    FROM public.compras c
    WHERE 
      c.fecha >= desde 
      AND c.fecha <= hasta
      AND (p_sucursal_id IS NULL OR c.sucursal_id = p_sucursal_id)
      AND c.sucursal_id IS NOT NULL
    ORDER BY c.fecha, c.sucursal_id, c.factura
  ) LOOP
    -- Skip if no amount
    CONTINUE WHEN rec.total = 0;
    
    -- Get account mapping for this sucursal
    SELECT value INTO v_settings
    FROM public.app_settings
    WHERE scope = 'sucursal' 
      AND app_settings.sucursal_id = rec.sucursal_id 
      AND key = 'map_purchases'
    LIMIT 1;
    
    -- Skip if no mapping configured
    IF v_settings IS NULL THEN
      RAISE NOTICE 'No purchases mapping configured for sucursal %', rec.sucursal_id;
      CONTINUE;
    END IF;
    
    -- Extract account UUIDs from settings
    v_expense_account := (v_settings->>'cogs_or_expense_account')::uuid;
    v_itbms_account := (v_settings->>'itbms_purchases_account')::uuid;
    v_ap_account := (v_settings->>'ap_account')::uuid;
    
    -- Validate required accounts
    IF v_expense_account IS NULL OR v_itbms_account IS NULL OR v_ap_account IS NULL THEN
      RAISE NOTICE 'Incomplete mapping for sucursal %. Required: cogs_or_expense_account, itbms_purchases_account, ap_account', rec.sucursal_id;
      CONTINUE;
    END IF;
    
    -- Generate reference and memo
    v_ref := 'AP-' || COALESCE(rec.factura, 'INV') || '-' || SUBSTRING(rec.proveedor FROM 1 FOR 20);
    v_memo := 'Purchase from ' || rec.proveedor || ' - Invoice ' || COALESCE(rec.factura, 'N/A');
    
    -- Create journal entry (idempotent with ON CONFLICT)
    INSERT INTO public.gl_journal (
      sucursal_id, source, ref, memo, date, posted_by
    )
    VALUES (
      rec.sucursal_id, 'CSV', v_ref, v_memo, rec.fecha, auth.uid()
    )
    ON CONFLICT (source, ref, date, sucursal_id) DO NOTHING
    RETURNING id INTO v_journal_id;
    
    -- Skip if journal already exists (idempotent)
    CONTINUE WHEN v_journal_id IS NULL;
    
    -- DR: Expense/COGS (subtotal)
    INSERT INTO public.gl_entry (journal_id, account_id, debit, credit, memo)
    VALUES (v_journal_id, v_expense_account, rec.subtotal, 0, 'Purchase expense/COGS');
    
    -- DR: ITBMS Receivable (tax)
    IF rec.itbms > 0 THEN
      INSERT INTO public.gl_entry (journal_id, account_id, debit, credit, memo)
      VALUES (v_journal_id, v_itbms_account, rec.itbms, 0, 'Purchase tax receivable');
    END IF;
    
    -- CR: Accounts Payable (total)
    INSERT INTO public.gl_entry (journal_id, account_id, debit, credit, memo)
    VALUES (v_journal_id, v_ap_account, 0, rec.total, 'Amount owed to vendor');
    
    -- Return created journal info
    RETURN QUERY
    SELECT 
      v_journal_id,
      'CSV'::text,
      v_ref,
      rec.fecha,
      rec.sucursal_id,
      rec.proveedor,
      rec.factura,
      rec.total,
      3::int;
  END LOOP;
  
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.api_post_sales_to_gl IS 'Post sales from both INVU API and CSV imports to general ledger';
COMMENT ON FUNCTION public.api_post_purchases_to_gl IS 'Post purchases from CSV imports to general ledger';

-- =====================================================
-- 3. POST COGS FROM INVENTORY MOVEMENTS TO NEW GL
-- =====================================================

CREATE OR REPLACE FUNCTION public.cont_post_cogs_from_inv(
  desde date,
  hasta date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE (
  journal_id uuid,
  journal_date date,
  sucursal_id uuid,
  total_cogs numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  v_journal_id uuid;
  v_description text;
BEGIN
  FOR rec IN (
    SELECT
      c.fecha::date AS journal_date,
      c.sucursal_id,
      SUM(c.cogs)::numeric AS total_cogs
    FROM public.v_cogs_dia_norm c
    WHERE c.fecha::date BETWEEN desde AND hasta
      AND (p_sucursal_id IS NULL OR c.sucursal_id = p_sucursal_id)
    GROUP BY c.fecha::date, c.sucursal_id
    HAVING SUM(c.cogs) <> 0
    ORDER BY c.fecha::date, c.sucursal_id
  ) LOOP
    v_description := 'COGS real ' || to_char(rec.journal_date, 'YYYY-MM-DD');
    IF rec.sucursal_id IS NOT NULL THEN
      v_description := v_description || ' / sucursal ' || rec.sucursal_id;
    END IF;

    SELECT id INTO v_journal_id
    FROM public.contabilidad_journal
    WHERE journal_date = rec.journal_date
      AND description = v_description
      AND source = 'cogs';

    IF v_journal_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.contabilidad_journal (
      journal_date,
      description,
      source,
      sucursal_id
    )
    VALUES (
      rec.journal_date,
      v_description,
      'cogs',
      rec.sucursal_id
    )
    RETURNING id INTO v_journal_id;

    INSERT INTO public.contabilidad_journal_line (
      journal_id,
      account_code,
      debit,
      credit
    )
    VALUES
      (v_journal_id, '5.1.1', rec.total_cogs, 0),
      (v_journal_id, '1.3.1', 0, rec.total_cogs);

    RETURN NEXT (
      v_journal_id,
      rec.journal_date,
      rec.sucursal_id,
      rec.total_cogs
    );
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.cont_post_cogs_from_inv IS 'Posts real COGS from v_cogs_dia_norm into contabilidad journal tables';
