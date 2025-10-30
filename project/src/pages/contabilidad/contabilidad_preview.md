# Preview P&L (lectura)

## Fuentes y supuestos

- **Ingresos**: se reutiliza la fuente consolidada usada en Reportes/Dashboard (`v_ventas_unified`). Se agregan las ventas por `sucursal_id` y se redondea al primer día del mes (`date_trunc('month', fecha)::date`).
- **COGS**: si existen movimientos reales de inventario en `inv_kardex_valorizado`, se prorratea por `sucursal_id`. Si no hay filas para un mes/sucursal, se recurre al catálogo `cont_cogs_policy` (porcentaje por sucursal) multiplicando los ingresos del mismo mes. Siempre se forza `COALESCE` para evitar nulos.
- **Gastos**: se combinan planilla mensual (`hr_periodo_totales`) y gastos fijos (`cont_gasto_fijo_mensual`). Ambos se agrupan por mes y sucursal.
- **P&L Preview**: junta las tres vistas anteriores y calcula `margen_bruto` y `utilidad_operativa` con `COALESCE`.
- Todas las vistas son **solo lectura** y viven en el esquema `public`. No se tocan policies ni tablas.

## SQL propuesto (migración)

```sql
create or replace view public.v_ingresos_mensual_sucursal as
select
  date_trunc('month', fecha)::date as mes,
  sucursal_id,
  sum(total_bruto) as ingresos
from public.v_ventas_unified
where fecha is not null
group by 1, 2;

create or replace view public.v_cogs_mensual_sucursal as
with cogs_reales as (
  select
    date_trunc('month', fecha)::date as mes,
    sucursal_id,
    sum(costo_total) as cogs
  from public.inv_kardex_valorizado
  group by 1, 2
),
base as (
  select i.mes, i.sucursal_id, coalesce(cr.cogs, i.ingresos * p.percent) as cogs
  from public.v_ingresos_mensual_sucursal i
  left join cogs_reales cr on cr.mes = i.mes and cr.sucursal_id = i.sucursal_id
  left join public.cont_cogs_policy p on p.sucursal_id = i.sucursal_id
)
select
  mes,
  sucursal_id,
  coalesce(cogs, 0) as cogs
from base;

create or replace view public.v_gastos_mensual_sucursal as
with planilla as (
  select date_trunc('month', periodo)::date as mes, sucursal_id, sum(total_planilla) as monto
  from public.hr_periodo_totales
  group by 1, 2
),
fijos as (
  select periodo as mes, sucursal_id, sum(monto) as monto
  from public.cont_gasto_fijo_mensual
  group by 1, 2
)
select
  coalesce(p.mes, f.mes) as mes,
  coalesce(p.sucursal_id, f.sucursal_id) as sucursal_id,
  coalesce(p.monto, 0) + coalesce(f.monto, 0) as gastos
from planilla p
full outer join fijos f on f.mes = p.mes and f.sucursal_id = p.sucursal_id;

create or replace view public.v_pnl_mensual_preview as
select
  coalesce(i.mes, c.mes, g.mes) as mes,
  coalesce(i.sucursal_id, c.sucursal_id, g.sucursal_id) as sucursal_id,
  coalesce(i.ingresos, 0) as ingresos,
  coalesce(c.cogs, 0) as cogs,
  coalesce(g.gastos, 0) as gastos,
  coalesce(i.ingresos, 0) - coalesce(c.cogs, 0) as margen_bruto,
  coalesce(i.ingresos, 0) - coalesce(c.cogs, 0) - coalesce(g.gastos, 0) as utilidad_operativa
from public.v_ingresos_mensual_sucursal i
full outer join public.v_cogs_mensual_sucursal c
  on c.mes = i.mes and c.sucursal_id = i.sucursal_id
full outer join public.v_gastos_mensual_sucursal g
  on g.mes = coalesce(i.mes, c.mes)
 and g.sucursal_id = coalesce(i.sucursal_id, c.sucursal_id);
```

> Todas las vistas son `stable` (solo lectura) y no dependen de mutaciones.

## Queries de prueba

1. **Preview de marzo 2024 para sucursales activas**
   ```sql
   select *
   from v_pnl_mensual_preview
   where mes = '2024-03-01'
   order by sucursal_id;
   ```
2. **Validar que COGS tenga un valor por sucursal**
   ```sql
   select mes, sucursal_id, cogs
   from v_cogs_mensual_sucursal
   where cogs is null;
   ```
3. **Cruce ingresos vs gastos**
   ```sql
   select p.mes,
          sum(p.ingresos) ingresos_total,
          sum(p.gastos) gastos_total,
          sum(p.utilidad_operativa) utilidad_total
   from v_pnl_mensual_preview p
   group by 1
   order by 1;
   ```
