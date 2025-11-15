BEGIN;

-- Monthly ingresos aggregated from contabilidad_journal using account codes 4***.
CREATE OR REPLACE VIEW public.v_gl_monthly_ingresos AS
SELECT
  date_trunc('month', j.journal_date)::date AS mes,
  j.sucursal_id,
  COALESCE(SUM(jl.credit - jl.debit), 0)::numeric AS ingresos
FROM public.contabilidad_journal_line jl
JOIN public.contabilidad_journal j
  ON j.id = jl.journal_id
LEFT JOIN public.cont_account ca
  ON ca.code = jl.account_id
WHERE (jl.account_id LIKE '4%' OR ca.code LIKE '4%')
GROUP BY 1, 2;

COMMENT ON VIEW public.v_gl_monthly_ingresos IS 'Monthly ingresos from contabilidad journals using revenue accounts (4***).';

-- Monthly COGS aggregated from contabilidad_journal using account code 5.1.1.
CREATE OR REPLACE VIEW public.v_gl_monthly_cogs AS
SELECT
  date_trunc('month', j.journal_date)::date AS mes,
  j.sucursal_id,
  COALESCE(SUM(jl.debit - jl.credit), 0)::numeric AS cogs
FROM public.contabilidad_journal_line jl
JOIN public.contabilidad_journal j
  ON j.id = jl.journal_id
LEFT JOIN public.cont_account ca
  ON ca.code = jl.account_id
WHERE COALESCE(jl.account_id, ca.code) = '5.1.1'
GROUP BY 1, 2;

COMMENT ON VIEW public.v_gl_monthly_cogs IS 'Monthly cost of goods sold from contabilidad journals using account 5.1.1.';

-- Monthly gastos aggregated from contabilidad_journal using expense accounts 5*** excluding 5.1.1.
CREATE OR REPLACE VIEW public.v_gl_monthly_gastos AS
SELECT
  date_trunc('month', j.journal_date)::date AS mes,
  j.sucursal_id,
  COALESCE(SUM(jl.debit - jl.credit), 0)::numeric AS gastos
FROM public.contabilidad_journal_line jl
JOIN public.contabilidad_journal j
  ON j.id = jl.journal_id
LEFT JOIN public.cont_account ca
  ON ca.code = jl.account_id
WHERE (jl.account_id LIKE '5%' OR ca.code LIKE '5%')
  AND COALESCE(jl.account_id, ca.code) <> '5.1.1'
GROUP BY 1, 2;

COMMENT ON VIEW public.v_gl_monthly_gastos IS 'Monthly operating expenses from contabilidad journals using expense accounts (5***) excluding 5.1.1.';

-- RPC that consolidates monthly P&L totals directly from the GL views.
CREATE OR REPLACE FUNCTION public.rpc_gl_pnl_monthly(
  p_mes date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE(
  ingresos numeric,
  cogs numeric,
  gastos numeric,
  utilidad numeric
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_mes date;
  v_ingresos numeric := 0;
  v_cogs numeric := 0;
  v_gastos numeric := 0;
BEGIN
  IF p_mes IS NULL THEN
    RAISE EXCEPTION 'El parámetro mes es obligatorio';
  END IF;

  v_mes := date_trunc('month', p_mes)::date;

  SELECT COALESCE(SUM(ingresos), 0)
  INTO v_ingresos
  FROM public.v_gl_monthly_ingresos
  WHERE mes = v_mes
    AND (p_sucursal_id IS NULL OR sucursal_id = p_sucursal_id);

  SELECT COALESCE(SUM(cogs), 0)
  INTO v_cogs
  FROM public.v_gl_monthly_cogs
  WHERE mes = v_mes
    AND (p_sucursal_id IS NULL OR sucursal_id = p_sucursal_id);

  SELECT COALESCE(SUM(gastos), 0)
  INTO v_gastos
  FROM public.v_gl_monthly_gastos
  WHERE mes = v_mes
    AND (p_sucursal_id IS NULL OR sucursal_id = p_sucursal_id);

  RETURN QUERY
  SELECT
    v_ingresos,
    v_cogs,
    v_gastos,
    v_ingresos - v_cogs - v_gastos;
END;
$function$;

COMMENT ON FUNCTION public.rpc_gl_pnl_monthly(date, uuid) IS 'Returns monthly ingresos, COGS, gastos and utilidad aggregated from contabilidad_journal for the requested month and sucursal (NULL = consolidado).';

COMMIT;
