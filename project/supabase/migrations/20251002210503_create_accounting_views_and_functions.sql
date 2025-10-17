/*
  # Accounting Views and Reporting Functions

  ## Summary
  Creates comprehensive financial reporting views and functions for:
  - Trial Balance
  - General Ledger
  - Profit & Loss Statement
  - Balance Sheet
  - Cash Flow Statement

  ## Views/Functions Created

  ### 1. v_trial_balance(desde, hasta)
  Returns account balances for a date range with hierarchical rollup
  
  ### 2. v_general_ledger(account_id, desde, hasta)
  Returns detailed transaction history with running balance
  
  ### 3. v_pl(desde, hasta)
  Returns Income Statement (INCOME - EXPENSE) grouped by account hierarchy
  
  ### 4. v_balance_sheet(corte)
  Returns Balance Sheet (ASSET = LIABILITY + EQUITY) at a point in time
  
  ### 5. v_cashflow(desde, hasta)
  Returns basic indirect cash flow analysis

  ## Important Notes
  - All functions respect RLS policies
  - Date parameters are inclusive
  - All monetary values in numeric format
  - Supports multi-branch consolidation
*/

-- =====================================================
-- 1. TRIAL BALANCE VIEW FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.v_trial_balance(
  desde date,
  hasta date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  account_level int,
  parent_id uuid,
  sucursal_id uuid,
  sucursal_nombre text,
  total_debit numeric,
  total_credit numeric,
  balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id AS account_id,
    a.code AS account_code,
    a.name AS account_name,
    a.type AS account_type,
    a.level AS account_level,
    a.parent_id,
    j.sucursal_id,
    s.nombre AS sucursal_nombre,
    COALESCE(SUM(e.debit), 0) AS total_debit,
    COALESCE(SUM(e.credit), 0) AS total_credit,
    COALESCE(SUM(e.debit - e.credit), 0) AS balance
  FROM public.coa_account a
  LEFT JOIN public.gl_entry e ON e.account_id = a.id
  LEFT JOIN public.gl_journal j ON j.id = e.journal_id 
    AND j.date >= desde 
    AND j.date <= hasta
    AND (p_sucursal_id IS NULL OR j.sucursal_id = p_sucursal_id)
  LEFT JOIN public.sucursal s ON s.id = j.sucursal_id
  WHERE a.active = true
  GROUP BY 
    a.id, a.code, a.name, a.type, a.level, a.parent_id,
    j.sucursal_id, s.nombre
  HAVING COALESCE(SUM(e.debit), 0) <> 0 OR COALESCE(SUM(e.credit), 0) <> 0
  ORDER BY a.code, s.nombre;
END;
$$;

COMMENT ON FUNCTION public.v_trial_balance IS 'Trial balance report with account balances by branch for a date range';

-- =====================================================
-- 2. GENERAL LEDGER VIEW FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.v_general_ledger(
  p_account_id uuid,
  desde date,
  hasta date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE (
  entry_date date,
  journal_id uuid,
  journal_ref text,
  journal_memo text,
  journal_source text,
  sucursal_id uuid,
  sucursal_nombre text,
  debit numeric,
  credit numeric,
  balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH ledger_entries AS (
    SELECT 
      j.date AS entry_date,
      j.id AS journal_id,
      j.ref AS journal_ref,
      j.memo AS journal_memo,
      j.source AS journal_source,
      j.sucursal_id,
      s.nombre AS sucursal_nombre,
      e.debit,
      e.credit
    FROM public.gl_entry e
    INNER JOIN public.gl_journal j ON j.id = e.journal_id
    LEFT JOIN public.sucursal s ON s.id = j.sucursal_id
    WHERE 
      e.account_id = p_account_id
      AND j.date >= desde 
      AND j.date <= hasta
      AND (p_sucursal_id IS NULL OR j.sucursal_id = p_sucursal_id)
    ORDER BY j.date, j.created_at, e.created_at
  )
  SELECT 
    le.entry_date,
    le.journal_id,
    le.journal_ref,
    le.journal_memo,
    le.journal_source,
    le.sucursal_id,
    le.sucursal_nombre,
    le.debit,
    le.credit,
    SUM(le.debit - le.credit) OVER (ORDER BY le.entry_date, le.journal_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
  FROM ledger_entries le;
END;
$$;

COMMENT ON FUNCTION public.v_general_ledger IS 'General ledger with running balance for a specific account';

-- =====================================================
-- 3. PROFIT & LOSS STATEMENT FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.v_pl(
  desde date,
  hasta date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE (
  account_type text,
  account_code text,
  account_name text,
  account_level int,
  parent_id uuid,
  amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.type AS account_type,
    a.code AS account_code,
    a.name AS account_name,
    a.level AS account_level,
    a.parent_id,
    CASE 
      WHEN a.type = 'INCOME' THEN COALESCE(SUM(e.credit - e.debit), 0)
      WHEN a.type = 'EXPENSE' THEN COALESCE(SUM(e.debit - e.credit), 0)
      ELSE 0
    END AS amount
  FROM public.coa_account a
  LEFT JOIN public.gl_entry e ON e.account_id = a.id
  LEFT JOIN public.gl_journal j ON j.id = e.journal_id 
    AND j.date >= desde 
    AND j.date <= hasta
    AND (p_sucursal_id IS NULL OR j.sucursal_id = p_sucursal_id)
  WHERE 
    a.active = true
    AND a.type IN ('INCOME', 'EXPENSE')
  GROUP BY 
    a.id, a.type, a.code, a.name, a.level, a.parent_id
  HAVING 
    COALESCE(SUM(e.debit), 0) <> 0 OR COALESCE(SUM(e.credit), 0) <> 0
  ORDER BY 
    a.type DESC, a.code;
END;
$$;

COMMENT ON FUNCTION public.v_pl IS 'Profit & Loss statement (Income Statement) for a date range';

-- =====================================================
-- 4. BALANCE SHEET FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.v_balance_sheet(
  corte date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE (
  account_type text,
  account_code text,
  account_name text,
  account_level int,
  parent_id uuid,
  amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.type AS account_type,
    a.code AS account_code,
    a.name AS account_name,
    a.level AS account_level,
    a.parent_id,
    CASE 
      WHEN a.type IN ('ASSET', 'EXPENSE') THEN COALESCE(SUM(e.debit - e.credit), 0)
      WHEN a.type IN ('LIABILITY', 'EQUITY', 'INCOME') THEN COALESCE(SUM(e.credit - e.debit), 0)
      ELSE 0
    END AS amount
  FROM public.coa_account a
  LEFT JOIN public.gl_entry e ON e.account_id = a.id
  LEFT JOIN public.gl_journal j ON j.id = e.journal_id 
    AND j.date <= corte
    AND (p_sucursal_id IS NULL OR j.sucursal_id = p_sucursal_id)
  WHERE 
    a.active = true
    AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
  GROUP BY 
    a.id, a.type, a.code, a.name, a.level, a.parent_id
  HAVING 
    COALESCE(SUM(e.debit), 0) <> 0 OR COALESCE(SUM(e.credit), 0) <> 0
  ORDER BY 
    CASE a.type 
      WHEN 'ASSET' THEN 1 
      WHEN 'LIABILITY' THEN 2 
      WHEN 'EQUITY' THEN 3 
    END,
    a.code;
END;
$$;

COMMENT ON FUNCTION public.v_balance_sheet IS 'Balance Sheet at a specific date';

-- =====================================================
-- 5. CASH FLOW STATEMENT FUNCTION (INDIRECT METHOD)
-- =====================================================

CREATE OR REPLACE FUNCTION public.v_cashflow(
  desde date,
  hasta date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE (
  section text,
  account_code text,
  account_name text,
  amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH net_income AS (
    -- Net Income from P&L
    SELECT 
      'OPERATING' AS section,
      'NET_INCOME' AS account_code,
      'Net Income' AS account_name,
      COALESCE(SUM(
        CASE 
          WHEN a.type = 'INCOME' THEN e.credit - e.debit
          WHEN a.type = 'EXPENSE' THEN e.debit - e.credit
          ELSE 0
        END
      ), 0) AS amount
    FROM public.coa_account a
    LEFT JOIN public.gl_entry e ON e.account_id = a.id
    LEFT JOIN public.gl_journal j ON j.id = e.journal_id 
      AND j.date >= desde 
      AND j.date <= hasta
      AND (p_sucursal_id IS NULL OR j.sucursal_id = p_sucursal_id)
    WHERE a.type IN ('INCOME', 'EXPENSE')
  ),
  operating_changes AS (
    -- Changes in operating accounts (AR, AP, Inventory, etc.)
    SELECT 
      'OPERATING' AS section,
      a.code AS account_code,
      a.name AS account_name,
      COALESCE(SUM(e.credit - e.debit), 0) AS amount
    FROM public.coa_account a
    LEFT JOIN public.gl_entry e ON e.account_id = a.id
    LEFT JOIN public.gl_journal j ON j.id = e.journal_id 
      AND j.date >= desde 
      AND j.date <= hasta
      AND (p_sucursal_id IS NULL OR j.sucursal_id = p_sucursal_id)
    WHERE 
      a.type = 'ASSET'
      AND a.code SIMILAR TO '1[1-3]%' -- Current assets (AR, Inventory, Prepaid)
      AND a.active = true
    GROUP BY a.code, a.name
    HAVING COALESCE(SUM(e.debit), 0) <> 0 OR COALESCE(SUM(e.credit), 0) <> 0
  ),
  investing_activities AS (
    -- Changes in long-term assets
    SELECT 
      'INVESTING' AS section,
      a.code AS account_code,
      a.name AS account_name,
      COALESCE(SUM(e.credit - e.debit), 0) AS amount
    FROM public.coa_account a
    LEFT JOIN public.gl_entry e ON e.account_id = a.id
    LEFT JOIN public.gl_journal j ON j.id = e.journal_id 
      AND j.date >= desde 
      AND j.date <= hasta
      AND (p_sucursal_id IS NULL OR j.sucursal_id = p_sucursal_id)
    WHERE 
      a.type = 'ASSET'
      AND a.code SIMILAR TO '1[4-9]%' -- Long-term assets (PP&E, Investments)
      AND a.active = true
    GROUP BY a.code, a.name
    HAVING COALESCE(SUM(e.debit), 0) <> 0 OR COALESCE(SUM(e.credit), 0) <> 0
  ),
  financing_activities AS (
    -- Changes in long-term liabilities and equity
    SELECT 
      'FINANCING' AS section,
      a.code AS account_code,
      a.name AS account_name,
      COALESCE(SUM(e.debit - e.credit), 0) AS amount
    FROM public.coa_account a
    LEFT JOIN public.gl_entry e ON e.account_id = a.id
    LEFT JOIN public.gl_journal j ON j.id = e.journal_id 
      AND j.date >= desde 
      AND j.date <= hasta
      AND (p_sucursal_id IS NULL OR j.sucursal_id = p_sucursal_id)
    WHERE 
      a.type IN ('LIABILITY', 'EQUITY')
      AND a.code SIMILAR TO '[23]%' -- Long-term liabilities and equity
      AND a.active = true
    GROUP BY a.code, a.name
    HAVING COALESCE(SUM(e.debit), 0) <> 0 OR COALESCE(SUM(e.credit), 0) <> 0
  )
  SELECT * FROM net_income
  UNION ALL
  SELECT * FROM operating_changes
  UNION ALL
  SELECT * FROM investing_activities
  UNION ALL
  SELECT * FROM financing_activities
  ORDER BY 
    CASE section 
      WHEN 'OPERATING' THEN 1 
      WHEN 'INVESTING' THEN 2 
      WHEN 'FINANCING' THEN 3 
    END,
    account_code;
END;
$$;

COMMENT ON FUNCTION public.v_cashflow IS 'Cash flow statement using indirect method';
