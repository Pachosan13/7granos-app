/*
  # Fix Sales Data Synchronization - Create Unified Sales Architecture

  ## Summary
  Creates the missing `ventas` table (CSV fallback) and unified RPC function
  to fix the data synchronization issue where VentasPage doesn't show INVU synced data.

  ## Problem Statement
  - Dashboard and VentasPage read from `ventas` table
  - sync-ventas-v3 edge function writes to `invu_ventas` table
  - Result: Synced INVU data never appears in VentasPage

  ## Solution
  - Create `ventas` table (CSV fallback with same structure as invu_ventas)
  - Create `api_resumen_ventas` RPC that aggregates from BOTH tables
  - Enable RLS with same policies as invu_ventas
  - Add indexes for performance

  ## Tables Created

  ### 1. ventas
  CSV import fallback table for sales data when INVU API is unavailable
  - Same structure as invu_ventas for consistency
  - Separate table to maintain data source traceability
  - Used for redundancy only

  ## Functions Created

  ### 2. api_resumen_ventas(p_desde, p_hasta)
  Unified RPC function that aggregates sales data from BOTH sources:
  - invu_ventas (INVU API sync - PRIMARY)
  - ventas (CSV imports - FALLBACK)
  - Returns summary by sucursal with totals and transaction counts
  - Deduplicates data (INVU takes priority over CSV)
  - Respects RLS policies

  ## Security
  - RLS enabled on ventas table
  - Same access policies as invu_ventas (membership-based)
  - Users only see data from their assigned sucursales
  - Admin/contador roles see all data

  ## Indexes
  - idx_ventas_fecha: Query by date
  - idx_ventas_sucursal: Query by sucursal
  - idx_ventas_fecha_sucursal: Composite for date range + sucursal queries
*/

-- =====================================================
-- 1. CREATE VENTAS TABLE (CSV FALLBACK)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ventas (
  id text PRIMARY KEY,
  fecha date NOT NULL,
  sucursal_id uuid NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  itbms numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  propina numeric(12,2),
  num_items int,
  num_transacciones int DEFAULT 1,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.ventas IS 'Sales data from CSV imports (fallback when INVU API unavailable)';
COMMENT ON COLUMN public.ventas.id IS 'Unique transaction ID (from CSV or generated)';
COMMENT ON COLUMN public.ventas.num_transacciones IS 'Number of transactions (for aggregated CSV imports)';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON public.ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_sucursal ON public.ventas(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_sucursal ON public.ventas(fecha, sucursal_id);

-- =====================================================
-- 2. ENABLE RLS ON VENTAS TABLE
-- =====================================================

ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

-- Policy: users only see ventas from their assigned sucursales
DROP POLICY IF EXISTS "ventas by membership" ON public.ventas;
CREATE POLICY "ventas by membership" ON public.ventas
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.user_sucursal us
      WHERE us.user_id = auth.uid()
        AND us.sucursal_id = ventas.sucursal_id
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.user_profile p
      WHERE p.user_id = auth.uid()
        AND p.rol IN ('admin', 'contador')
    )
  );

-- Policy: Allow authenticated users to insert (for CSV imports)
DROP POLICY IF EXISTS "ventas insert by authenticated" ON public.ventas;
CREATE POLICY "ventas insert by authenticated" ON public.ventas
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_sucursal us
      WHERE us.user_id = auth.uid()
        AND us.sucursal_id = ventas.sucursal_id
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.user_profile p
      WHERE p.user_id = auth.uid()
        AND p.rol IN ('admin', 'contador')
    )
  );

-- Policy: Allow authenticated users to update their ventas
DROP POLICY IF EXISTS "ventas update by membership" ON public.ventas;
CREATE POLICY "ventas update by membership" ON public.ventas
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_sucursal us
      WHERE us.user_id = auth.uid()
        AND us.sucursal_id = ventas.sucursal_id
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.user_profile p
      WHERE p.user_id = auth.uid()
        AND p.rol IN ('admin', 'contador')
    )
  );

-- =====================================================
-- 3. CREATE API_RESUMEN_VENTAS RPC FUNCTION
-- Unified aggregation from BOTH invu_ventas and ventas
-- =====================================================

CREATE OR REPLACE FUNCTION public.api_resumen_ventas(
  p_desde date,
  p_hasta date
)
RETURNS TABLE (
  sucursal_id uuid,
  nombre text,
  total numeric,
  num_transacciones bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH combined_ventas AS (
    -- INVU API data (PRIMARY SOURCE)
    SELECT
      iv.fecha,
      iv.sucursal_id,
      iv.total,
      1 AS num_trans
    FROM public.invu_ventas iv
    WHERE iv.fecha >= p_desde
      AND iv.fecha <= p_hasta
      AND (
        EXISTS (
          SELECT 1 FROM public.user_sucursal us
          WHERE us.user_id = auth.uid() AND us.sucursal_id = iv.sucursal_id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_profile p
          WHERE p.user_id = auth.uid() AND p.rol IN ('admin', 'contador')
        )
      )

    UNION ALL

    -- CSV data (FALLBACK SOURCE)
    -- Only include if no INVU data exists for that date+sucursal
    SELECT
      v.fecha,
      v.sucursal_id,
      v.total,
      COALESCE(v.num_transacciones, 1) AS num_trans
    FROM public.ventas v
    WHERE v.fecha >= p_desde
      AND v.fecha <= p_hasta
      AND (
        EXISTS (
          SELECT 1 FROM public.user_sucursal us
          WHERE us.user_id = auth.uid() AND us.sucursal_id = v.sucursal_id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_profile p
          WHERE p.user_id = auth.uid() AND p.rol IN ('admin', 'contador')
        )
      )
      -- Exclude CSV data if INVU data exists for same date+sucursal
      AND NOT EXISTS (
        SELECT 1 FROM public.invu_ventas iv2
        WHERE iv2.fecha = v.fecha
          AND iv2.sucursal_id = v.sucursal_id
      )
  )
  SELECT
    cv.sucursal_id,
    s.nombre,
    COALESCE(SUM(cv.total), 0)::numeric AS total,
    COALESCE(SUM(cv.num_trans), 0)::bigint AS num_transacciones
  FROM combined_ventas cv
  INNER JOIN public.sucursal s ON s.id = cv.sucursal_id
  GROUP BY cv.sucursal_id, s.nombre
  ORDER BY s.nombre;
END;
$$;

COMMENT ON FUNCTION public.api_resumen_ventas IS 'Aggregates sales data from both invu_ventas (primary) and ventas (fallback CSV). INVU data takes priority over CSV data to avoid duplication.';

-- =====================================================
-- 4. CREATE HELPER VIEW FOR UNIFIED VENTAS
-- =====================================================

CREATE OR REPLACE VIEW public.v_ventas_unified AS
SELECT
  'INVU' AS source,
  iv.id,
  iv.fecha,
  iv.sucursal_id,
  s.nombre AS sucursal_nombre,
  iv.subtotal,
  iv.itbms,
  iv.total,
  iv.propina,
  iv.num_items,
  1 AS num_transacciones,
  iv.inserted_at,
  iv.updated_at
FROM public.invu_ventas iv
INNER JOIN public.sucursal s ON s.id = iv.sucursal_id

UNION ALL

SELECT
  'CSV' AS source,
  v.id,
  v.fecha,
  v.sucursal_id,
  s.nombre AS sucursal_nombre,
  v.subtotal,
  v.itbms,
  v.total,
  v.propina,
  v.num_items,
  COALESCE(v.num_transacciones, 1) AS num_transacciones,
  v.inserted_at,
  v.updated_at
FROM public.ventas v
INNER JOIN public.sucursal s ON s.id = v.sucursal_id
-- Only show CSV data if no INVU data exists for same date+sucursal
WHERE NOT EXISTS (
  SELECT 1 FROM public.invu_ventas iv2
  WHERE iv2.fecha = v.fecha
    AND iv2.sucursal_id = v.sucursal_id
);

COMMENT ON VIEW public.v_ventas_unified IS 'Unified view of sales from both INVU API and CSV sources. Shows INVU data primarily, CSV data only when INVU data is missing for that date+sucursal.';
