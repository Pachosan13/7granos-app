# Preview P&L (lectura)

## Fuentes y supuestos

- **Ingresos**: se reutiliza la vista consolidada `v_ventas_unified` (INVU + CSV). Los ingresos netos por sucursal/mes se calculan como `total - itbms` y se agrupan con `date_trunc('month', fecha)::date`.
- **COGS**: primero se busca costo real en `inv_kardex_valorizado`. Si no hay filas para el mes/sucursal se usa `cont_cogs_policy` (modo `percent`) multiplicando los ingresos del mes. Los porcentajes se almacenan en UI como 0-100, por lo que en SQL se normalizan dividiendo entre 100 cuando es > 1.
- **Gastos**: se suman planilla (`hr_periodo_totales.total_costo_laboral` junto con `hr_periodo` para la fecha) y gastos fijos (`cont_gasto_fijo_mensual`). Ambos se normalizan al primer día del mes (`make_date` y `to_date(left(periodo::text,7)||'-01', ...)`).
- **P&L Preview**: combina las tres vistas anteriores asegurando `COALESCE` en todos los montos y calculando `margen_bruto` y `utilidad_operativa`.
- Todas las vistas viven en el esquema `public`, son de solo lectura y no modifican policies.

## SQL aplicado (migración `20251015220000_create_pnl_preview_views.sql`)

```sql
create or replace view public.v_ingresos_mensual_sucursal as
select
  date_trunc('month', vv.fecha)::date as mes,
  vv.sucursal_id,
  sum(coalesce(vv.total, 0)::numeric - coalesce(vv.itbms, 0)::numeric) as ingresos
from public.v_ventas_unified vv
where vv.fecha is not null
group by 1, 2;

create or replace view public.v_cogs_mensual_sucursal as
with ingresos as (
  select mes, sucursal_id, ingresos
  from public.v_ingresos_mensual_sucursal
), periods as (
  select mes, sucursal_id from ingresos
  union
  select date_trunc('month', k.fecha)::date, k.sucursal_id
  from public.inv_kardex_valorizado k
), cogs_reales as (
  select
    date_trunc('month', k.fecha)::date as mes,
    k.sucursal_id,
    sum(coalesce(k.costo_total, 0)::numeric) as cogs
  from public.inv_kardex_valorizado k
  group by 1, 2
)
select
  p.mes,
  p.sucursal_id,
  coalesce(
    cr.cogs,
    case
      when cp.mode = 'percent' or cp.mode is null then
        coalesce(i.ingresos, 0)::numeric * coalesce(
          case
            when cp.percent is null then 0::numeric
            when cp.percent > 1 then (cp.percent / 100.0)::numeric
            else cp.percent::numeric
          end,
          0::numeric
        )
      else 0::numeric
    end
  ) as cogs
from periods p
left join ingresos i on i.mes = p.mes and i.sucursal_id = p.sucursal_id
left join cogs_reales cr on cr.mes = p.mes and cr.sucursal_id = p.sucursal_id
left join public.cont_cogs_policy cp on cp.sucursal_id = p.sucursal_id;

create or replace view public.v_gastos_mensual_sucursal as
with planilla as (
  select
    make_date(p.periodo_ano, p.periodo_mes, 1) as mes,
    p.sucursal_id,
    sum(coalesce(t.total_costo_laboral, 0)::numeric) as monto
  from public.hr_periodo_totales t
  inner join public.hr_periodo p on p.id = t.periodo_id
  group by 1, 2
), fixed as (
  select
    to_date(left(f.periodo::text, 7) || '-01', 'YYYY-MM-DD') as mes,
    f.sucursal_id,
    sum(coalesce(f.monto, 0)::numeric) as monto
  from public.cont_gasto_fijo_mensual f
  where f.periodo is not null
  group by 1, 2
), periods as (
  select mes, sucursal_id from planilla
  union
  select mes, sucursal_id from fixed
)
select
  p.mes,
  p.sucursal_id,
  (coalesce(pl.monto, 0)::numeric + coalesce(fx.monto, 0)::numeric) as gastos
from periods p
left join planilla pl on pl.mes = p.mes and pl.sucursal_id = p.sucursal_id
left join fixed fx on fx.mes = p.mes and fx.sucursal_id = p.sucursal_id;

create or replace view public.v_pnl_mensual_preview as
with periods as (
  select mes, sucursal_id from public.v_ingresos_mensual_sucursal
  union
  select mes, sucursal_id from public.v_cogs_mensual_sucursal
  union
  select mes, sucursal_id from public.v_gastos_mensual_sucursal
)
select
  p.mes,
  p.sucursal_id,
  coalesce(i.ingresos, 0)::numeric as ingresos,
  coalesce(c.cogs, 0)::numeric as cogs,
  coalesce(g.gastos, 0)::numeric as gastos,
  coalesce(i.ingresos, 0)::numeric - coalesce(c.cogs, 0)::numeric as margen_bruto,
  coalesce(i.ingresos, 0)::numeric - coalesce(c.cogs, 0)::numeric - coalesce(g.gastos, 0)::numeric as utilidad_operativa
from periods p
left join public.v_ingresos_mensual_sucursal i on i.mes = p.mes and i.sucursal_id = p.sucursal_id
left join public.v_cogs_mensual_sucursal c on c.mes = p.mes and c.sucursal_id = p.sucursal_id
left join public.v_gastos_mensual_sucursal g on g.mes = p.mes and g.sucursal_id = p.sucursal_id;
```

## Queries de prueba (copiar/pegar)

1. **Ingresos mensuales (preview rápida)**
   ```sql
   select *
   from v_ingresos_mensual_sucursal
   order by mes desc, sucursal_id
   limit 5;
   ```
2. **COGS con fallback de percent**
   ```sql
   select *
   from v_cogs_mensual_sucursal
   order by mes desc, sucursal_id
   limit 5;
   ```
3. **Gastos (planilla + fijos)**
   ```sql
   select *
   from v_gastos_mensual_sucursal
   order by mes desc, sucursal_id
   limit 5;
   ```
4. **Preview P&L consolidado**
   ```sql
   select *
   from v_pnl_mensual_preview
   order by mes desc, sucursal_id
   limit 5;
   ```
