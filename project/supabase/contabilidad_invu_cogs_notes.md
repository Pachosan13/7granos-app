# INVU COGS Integration Notes

## Fuente de datos
- `public.vw_cogs_diarios` expone el costo real diario por sucursal calculado desde `invu_ventas.raw`.
- `public.v_cogs_dia_norm` normaliza esa vista y es la fuente directa para el posteo.

## Posteo al GL nuevo
- `public.cont_post_cogs_from_inv(desde, hasta, sucursal_id)` ahora inserta los COGS en `contabilidad_journal` y `contabilidad_journal_line`.
- Cada día genera (o actualiza) un journal `source = 'cogs'` con dos líneas balanceadas:
  - Débito a `cont_account.code = '5.1.1'` (COGS). Si no existe, usa la primera cuenta con `type = 'cogs'`.
  - Crédito a `cont_account.code = '1.3.1'` (Inventario). Si no existe, cae a la primera cuenta `type = 'asset'`.
- El meta de las líneas marca `origin = 'cont_post_cogs_from_inv'` para facilitar reprocesos idempotentes.

## Reprocesar un rango
Ejecutar desde SQL:
```sql
select *
from public.cont_post_cogs_from_inv(
  date '2025-11-01',
  date '2025-11-30',
  null
);
```
Esto recalcula (o crea) los journals `source = 'cogs'` para todas las sucursales en el rango indicado.
