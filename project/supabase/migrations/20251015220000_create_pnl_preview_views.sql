/*
  # Preview P&L Read-Only Views

  ## Summary
  Creates monthly-by-branch views for ingresos, COGS, gastos and a consolidated
  preview P&L that powers the "Preview P&L (lectura)" toggle in ReportesTab.

  ## Constraints
  - Read-only objects only (CREATE OR REPLACE VIEW)
  - No changes to RLS or base tables
  - Compatible with existing reporting sources (`v_ventas_unified`, payroll,
    fixed expenses, and COGS policies)
*/

-- =====================================================
-- 1. INGRESOS POR SUCURSAL / MES
-- =====================================================

CREATE OR REPLACE VIEW public.v_ingresos_mensual_sucursal AS
SELECT
  date_trunc('month', vv.fecha)::date AS mes,
  vv.sucursal_id,
  SUM(
    COALESCE(vv.total, 0)::numeric - COALESCE(vv.itbms, 0)::numeric
  ) AS ingresos
FROM public.v_ventas_unified vv
WHERE vv.fecha IS NOT NULL
GROUP BY 1, 2;

COMMENT ON VIEW public.v_ingresos_mensual_sucursal IS 'Monthly net sales (total - ITBMS) per sucursal using the unified ventas source.';

-- =====================================================
-- 2. COGS POR SUCURSAL / MES
-- =====================================================

CREATE OR REPLACE VIEW public.v_cogs_mensual_sucursal AS
WITH ingresos AS (
  SELECT mes, sucursal_id, ingresos
  FROM public.v_ingresos_mensual_sucursal
),
periods AS (
  SELECT mes, sucursal_id FROM ingresos
  UNION
  SELECT date_trunc('month', k.fecha)::date AS mes, k.sucursal_id
  FROM public.inv_kardex_valorizado k
),
cogs_reales AS (
  SELECT
    date_trunc('month', k.fecha)::date AS mes,
    k.sucursal_id,
    SUM(COALESCE(k.costo_total, 0)::numeric) AS cogs
  FROM public.inv_kardex_valorizado k
  GROUP BY 1, 2
)
SELECT
  p.mes,
  p.sucursal_id,
  COALESCE(
    cr.cogs,
    CASE
      WHEN cp.mode = 'percent' OR cp.mode IS NULL THEN
        COALESCE(i.ingresos, 0)::numeric * COALESCE(
          CASE
            WHEN cp.percent IS NULL THEN 0::numeric
            WHEN cp.percent > 1 THEN (cp.percent / 100.0)::numeric
            ELSE cp.percent::numeric
          END,
          0::numeric
        )
      ELSE 0::numeric
    END
  ) AS cogs
FROM periods p
LEFT JOIN ingresos i
  ON i.mes = p.mes AND i.sucursal_id = p.sucursal_id
LEFT JOIN cogs_reales cr
  ON cr.mes = p.mes AND cr.sucursal_id = p.sucursal_id
LEFT JOIN public.cont_cogs_policy cp
  ON cp.sucursal_id = p.sucursal_id;

COMMENT ON VIEW public.v_cogs_mensual_sucursal IS 'Monthly COGS per sucursal. Prefers actual inventory movements (inv_kardex_valorizado) and falls back to cont_cogs_policy percent * ingresos.';

-- =====================================================
-- 3. GASTOS POR SUCURSAL / MES
-- =====================================================

CREATE OR REPLACE VIEW public.v_gastos_mensual_sucursal AS
WITH planilla AS (
  SELECT
    make_date(p.periodo_ano, p.periodo_mes, 1) AS mes,
    p.sucursal_id,
    SUM(COALESCE(t.total_costo_laboral, 0)::numeric) AS monto
  FROM public.hr_periodo_totales t
  INNER JOIN public.hr_periodo p ON p.id = t.periodo_id
  GROUP BY 1, 2
),
fixed AS (
  SELECT
    to_date(left(f.periodo::text, 7) || '-01', 'YYYY-MM-DD') AS mes,
    f.sucursal_id,
    SUM(COALESCE(f.monto, 0)::numeric) AS monto
  FROM public.cont_gasto_fijo_mensual f
  WHERE f.periodo IS NOT NULL
  GROUP BY 1, 2
),
periods AS (
  SELECT mes, sucursal_id FROM planilla
  UNION
  SELECT mes, sucursal_id FROM fixed
)
SELECT
  p.mes,
  p.sucursal_id,
  (COALESCE(pl.monto, 0)::numeric + COALESCE(fx.monto, 0)::numeric) AS gastos
FROM periods p
LEFT JOIN planilla pl
  ON pl.mes = p.mes AND pl.sucursal_id = p.sucursal_id
LEFT JOIN fixed fx
  ON fx.mes = p.mes AND fx.sucursal_id = p.sucursal_id;

COMMENT ON VIEW public.v_gastos_mensual_sucursal IS 'Monthly expenses per sucursal combining payroll totals (total_costo_laboral) and fixed expenses.';

-- =====================================================
-- 4. PREVIEW P&L CONSOLIDATED VIEW
-- =====================================================

CREATE OR REPLACE VIEW public.v_pnl_mensual_preview AS
WITH periods AS (
  SELECT mes, sucursal_id FROM public.v_ingresos_mensual_sucursal
  UNION
  SELECT mes, sucursal_id FROM public.v_cogs_mensual_sucursal
  UNION
  SELECT mes, sucursal_id FROM public.v_gastos_mensual_sucursal
)
SELECT
  p.mes,
  p.sucursal_id,
  COALESCE(i.ingresos, 0)::numeric AS ingresos,
  COALESCE(c.cogs, 0)::numeric AS cogs,
  COALESCE(g.gastos, 0)::numeric AS gastos,
  (COALESCE(i.ingresos, 0)::numeric - COALESCE(c.cogs, 0)::numeric) AS margen_bruto,
  (COALESCE(i.ingresos, 0)::numeric - COALESCE(c.cogs, 0)::numeric - COALESCE(g.gastos, 0)::numeric) AS utilidad_operativa
FROM periods p
LEFT JOIN public.v_ingresos_mensual_sucursal i
  ON i.mes = p.mes AND i.sucursal_id = p.sucursal_id
LEFT JOIN public.v_cogs_mensual_sucursal c
  ON c.mes = p.mes AND c.sucursal_id = p.sucursal_id
LEFT JOIN public.v_gastos_mensual_sucursal g
  ON g.mes = p.mes AND g.sucursal_id = p.sucursal_id;

COMMENT ON VIEW public.v_pnl_mensual_preview IS 'Read-only preview Profit & Loss per month and sucursal with ingresos, COGS, gastos, margen bruto and utilidad operativa.';
