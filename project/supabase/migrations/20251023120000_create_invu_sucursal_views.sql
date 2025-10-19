-- Create/update sucursal KPI views for UI aggregation
create or replace view public.v_ui_kpis_hoy_sucursal as
select
  v.sucursal_id::text as sucursal_id,
  s.nombre as sucursal_nombre,
  current_date as dia,
  coalesce(sum(v.ventas), 0)::numeric(14, 2) as ventas,
  coalesce(sum(v.cogs), 0)::numeric(14, 2) as cogs,
  (coalesce(sum(v.ventas), 0) - coalesce(sum(v.cogs), 0))::numeric(14, 2) as margen,
  coalesce(sum(v.tickets), 0)::int as tickets,
  coalesce(sum(v.lineas), 0)::int as lineas
from public.v_ui_kpis_hoy v
left join public.sucursal s on s.id = v.sucursal_id
group by v.sucursal_id, s.nombre;

create or replace view public.v_ui_series_14d_sucursal as
select
  v.dia,
  v.sucursal_id::text as sucursal_id,
  s.nombre as sucursal_nombre,
  coalesce(sum(v.ventas), 0)::numeric(14, 2) as ventas,
  coalesce(sum(v.cogs), 0)::numeric(14, 2) as cogs,
  (coalesce(sum(v.ventas), 0) - coalesce(sum(v.cogs), 0))::numeric(14, 2) as margen
from public.v_ui_series_14d v
left join public.sucursal s on s.id = v.sucursal_id
group by v.dia, v.sucursal_id, s.nombre
order by v.dia;

alter table public.v_ui_kpis_hoy_sucursal enable row level security;
create policy if not exists "public read v_ui_kpis_hoy_sucursal"
  on public.v_ui_kpis_hoy_sucursal
  for select
  using (true);

alter table public.v_ui_series_14d_sucursal enable row level security;
create policy if not exists "public read v_ui_series_14d_sucursal"
  on public.v_ui_series_14d_sucursal
  for select
  using (true);
