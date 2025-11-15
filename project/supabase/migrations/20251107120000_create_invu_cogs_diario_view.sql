/*
  # INVU Daily COGS View

  Extracts real cost of goods sold from invu_ventas raw payload.
  Aggregates per ticket and per (fecha, sucursal_id).
*/

CREATE OR REPLACE VIEW public.v_invu_cogs_diario_sucursal AS
WITH ticket_costs AS (
  SELECT
    iv.fecha::date AS fecha,
    iv.sucursal_id,
    iv.id,
    SUM(
      COALESCE((item->>'costo')::numeric, 0)
      + COALESCE(
        (
          SELECT SUM(COALESCE((modif->>'costo_modif_productos')::numeric, 0))
          FROM jsonb_array_elements(COALESCE(item->'modif', '[]'::jsonb)) AS modif
        ),
        0
      )
    ) AS costo_ticket
  FROM public.invu_ventas iv
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(iv.raw->'items', '[]'::jsonb)) AS item
  GROUP BY iv.fecha, iv.sucursal_id, iv.id
)
SELECT
  fecha,
  sucursal_id,
  SUM(costo_ticket) AS cogs_real_dia
FROM ticket_costs
GROUP BY fecha, sucursal_id;

COMMENT ON VIEW public.v_invu_cogs_diario_sucursal IS 'Costo real diario por sucursal derivado de invu_ventas.raw (items + modificadores).';
