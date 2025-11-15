# INVU COGS Integration Notes

## Nuevas vistas y funciones
- `public.v_invu_cogs_diario_sucursal`: vista diaria por sucursal que calcula el costo real a partir de `invu_ventas.raw->'items'` y sus modificadores.
- `public.cont_resolve_auto_account(text[])`: helper para obtener códigos de cuenta desde `cont_account_auto_map`.
- `public.cont_apply_invu_cogs_to_sales_journal(uuid, boolean)`: aplica (o refresca) COGS reales a un journal de ventas existente.
- `public.cont_apply_invu_cogs_for_range(date, date, uuid)`: recorre un rango de fechas y aplica COGS a todos los journals de ventas.
- `public.cont_apply_invu_cogs_for_month(text, uuid)`: envoltura mensual usada por los RPC.
- `public.cont_post_sales_from_norm_view(...)`: ahora es un wrapper que llama a la versión original y, después de postear ventas, sincroniza los COGS reales usando `cont_apply_invu_cogs_for_month`.

## Cuentas utilizadas
- COGS: se resuelve con `cont_account_auto_map` (`ventas_cogs`, `ventas_cogs_account`, `cogs_ventas`, `ventas_costo`). Si no existe, cae al primer `cont_account` de tipo `cogs` (o `expense` como respaldo).
- Inventario: se resuelve con `cont_account_auto_map` (`ventas_inventario`, `inventario`, `inventory`, `ventas_inventory`). Como respaldo usa la primera cuenta `asset` cuyo nombre contiene "invent".

## Cómo re-postear COGS para un mes
Ejecutar desde SQL (ajustar mes/sucursal según necesidad):
```sql
select public.cont_apply_invu_cogs_for_month('2025-10', null);
```

Para un rango específico:
```sql
select public.cont_apply_invu_cogs_for_range('2025-10-01', '2025-10-31', '00000000-0000-0000-0000-000000000000');
```

El wrapper de `cont_post_sales_from_norm_view` ejecuta automáticamente estas funciones después de postear ventas, por lo que basta con volver a correr el flujo mensual desde Contabilidad PRO para recalcular COGS reales.
