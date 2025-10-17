/*
  # Sistema de Ventas INVU - Tabla de Transacciones y Funciones de Análisis

  ## 1. Nueva Tabla: invu_ventas
  Almacena transacciones individuales de ventas sincronizadas desde INVU POS
  
  Columnas:
  - id: Identificador único de la transacción (del sistema INVU)
  - fecha: Fecha de la transacción (date)
  - sucursal_id: Sucursal donde se realizó la transacción
  - subtotal: Monto sin impuestos
  - itbms: Impuesto ITBMS (7%)
  - total: Monto total de la venta
  - propina: Propina (opcional)
  - num_items: Número de items en la transacción
  - inserted_at: Timestamp de inserción en la BD
  - updated_at: Timestamp de última actualización

  ## 2. Función RPC: api_detalle_ventas
  Consulta optimizada de transacciones con filtros y paginación
  
  ## 3. Función RPC: api_kpis_dia
  Obtiene KPIs agregados del día seleccionado
  
  ## 4. Función RPC: api_sparkline_ventas
  Obtiene datos de tendencia de 7 días alrededor de la fecha seleccionada

  ## 5. Función RPC: api_count_ventas
  Cuenta total de transacciones para una fecha/sucursal

  ## 6. Seguridad
  - RLS habilitado en invu_ventas
  - Usuarios solo pueden ver transacciones de sus sucursales asignadas
  - Índices optimizados para consultas por fecha y sucursal
*/

-- =====================================================
-- 1. CREAR TABLA invu_ventas
-- =====================================================
CREATE TABLE IF NOT EXISTS public.invu_ventas (
  id text PRIMARY KEY,
  fecha date NOT NULL,
  sucursal_id uuid NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  itbms numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  propina numeric(12,2),
  num_items int,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para optimización
CREATE INDEX IF NOT EXISTS idx_invu_ventas_fecha ON public.invu_ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_invu_ventas_sucursal ON public.invu_ventas(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_invu_ventas_fecha_sucursal ON public.invu_ventas(fecha, sucursal_id);

-- =====================================================
-- 2. HABILITAR RLS EN invu_ventas
-- =====================================================
ALTER TABLE public.invu_ventas ENABLE ROW LEVEL SECURITY;

-- Política: usuarios solo ven ventas de sus sucursales asignadas
DROP POLICY IF EXISTS "invu_ventas by membership" ON public.invu_ventas;
CREATE POLICY "invu_ventas by membership" ON public.invu_ventas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 
      FROM public.user_sucursal us 
      WHERE us.user_id = auth.uid() 
        AND us.sucursal_id = invu_ventas.sucursal_id
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
-- 3. FUNCIÓN: api_detalle_ventas
-- Consulta de transacciones con filtros y paginación
-- =====================================================
CREATE OR REPLACE FUNCTION public.api_detalle_ventas(
  p_fecha date,
  p_sucursal_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id text,
  fecha date,
  sucursal_id uuid,
  sucursal_nombre text,
  subtotal numeric,
  itbms numeric,
  total numeric,
  propina numeric,
  num_items int,
  inserted_at timestamptz,
  total_count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_ventas AS (
    SELECT 
      v.id,
      v.fecha,
      v.sucursal_id,
      s.nombre as sucursal_nombre,
      v.subtotal,
      v.itbms,
      v.total,
      v.propina,
      v.num_items,
      v.inserted_at
    FROM public.invu_ventas v
    INNER JOIN public.sucursal s ON s.id = v.sucursal_id
    WHERE v.fecha = p_fecha
      AND (p_sucursal_id IS NULL OR v.sucursal_id = p_sucursal_id)
      AND (p_query IS NULL OR p_query = '' OR v.id ILIKE '%' || p_query || '%')
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
  ),
  total_rows AS (
    SELECT COUNT(*) as cnt FROM filtered_ventas
  )
  SELECT 
    fv.*,
    tr.cnt as total_count
  FROM filtered_ventas fv
  CROSS JOIN total_rows tr
  ORDER BY fv.inserted_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- =====================================================
-- 4. FUNCIÓN: api_kpis_dia
-- KPIs agregados del día
-- =====================================================
CREATE OR REPLACE FUNCTION public.api_kpis_dia(
  p_fecha date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_ventas', COALESCE(SUM(total), 0),
    'total_itbms', COALESCE(SUM(itbms), 0),
    'total_propinas', COALESCE(SUM(propina), 0),
    'num_transacciones', COUNT(*),
    'ticket_promedio', CASE 
      WHEN COUNT(*) > 0 THEN COALESCE(SUM(total), 0) / COUNT(*) 
      ELSE 0 
    END
  )
  INTO result
  FROM public.invu_ventas v
  WHERE v.fecha = p_fecha
    AND (p_sucursal_id IS NULL OR v.sucursal_id = p_sucursal_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.user_sucursal us 
        WHERE us.user_id = auth.uid() AND us.sucursal_id = v.sucursal_id
      )
      OR EXISTS (
        SELECT 1 FROM public.user_profile p 
        WHERE p.user_id = auth.uid() AND p.rol IN ('admin', 'contador')
      )
    );
  
  RETURN result;
END;
$$;

-- =====================================================
-- 5. FUNCIÓN: api_sparkline_ventas
-- Tendencia de 7 días alrededor de la fecha
-- =====================================================
CREATE OR REPLACE FUNCTION public.api_sparkline_ventas(
  p_fecha date,
  p_sucursal_id uuid DEFAULT NULL
)
RETURNS TABLE (
  fecha date,
  total_ventas numeric,
  num_transacciones bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.fecha,
    COALESCE(SUM(v.total), 0) as total_ventas,
    COUNT(*) as num_transacciones
  FROM public.invu_ventas v
  WHERE v.fecha BETWEEN (p_fecha - INTERVAL '3 days')::date AND (p_fecha + INTERVAL '3 days')::date
    AND (p_sucursal_id IS NULL OR v.sucursal_id = p_sucursal_id)
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
  GROUP BY v.fecha
  ORDER BY v.fecha ASC;
END;
$$;

-- =====================================================
-- 6. FUNCIÓN: api_count_ventas
-- Cuenta total de transacciones para una fecha/sucursal
-- =====================================================
CREATE OR REPLACE FUNCTION public.api_count_ventas(
  p_fecha date,
  p_sucursal_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result bigint;
BEGIN
  SELECT COUNT(*)
  INTO result
  FROM public.invu_ventas v
  WHERE v.fecha = p_fecha
    AND (p_sucursal_id IS NULL OR v.sucursal_id = p_sucursal_id)
    AND (p_query IS NULL OR p_query = '' OR v.id ILIKE '%' || p_query || '%')
    AND (
      EXISTS (
        SELECT 1 FROM public.user_sucursal us 
        WHERE us.user_id = auth.uid() AND us.sucursal_id = v.sucursal_id
      )
      OR EXISTS (
        SELECT 1 FROM public.user_profile p 
        WHERE p.user_id = auth.uid() AND p.rol IN ('admin', 'contador')
      )
    );
  
  RETURN result;
END;
$$;