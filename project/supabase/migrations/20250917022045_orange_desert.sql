-- Agrega columnas patronales y costo laboral
alter table public.hr_resultado
  add column if not exists css_patronal numeric(12,2) default 0,
  add column if not exists edu_patronal numeric(12,2) default 0,
  add column if not exists costo_laboral_total numeric(12,2) default 0;

-- Frecuencia del período (para prorrateo ISR ya usado)
alter table public.hr_periodo
  add column if not exists frecuencia text
  check (frecuencia in ('mensual','quincenal'))
  default 'mensual';

-- Totales del período
create table if not exists public.hr_periodo_totales (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.hr_periodo(id) on delete cascade,
  total_bruto numeric(14,2) not null default 0,
  total_legales_emp numeric(14,2) not null default 0,
  total_contractuales numeric(14,2) not null default 0,
  total_neto numeric(14,2) not null default 0,
  total_css_patronal numeric(14,2) not null default 0,
  total_edu_patronal numeric(14,2) not null default 0,
  total_costo_laboral numeric(14,2) not null default 0,
  detalle jsonb,
  unique (periodo_id)
);

alter table public.hr_periodo_totales enable row level security;
drop policy if exists "hr_totales by membership" on public.hr_periodo_totales;
create policy "hr_totales by membership" on public.hr_periodo_totales
for all using (
  exists (
    select 1
    from public.hr_periodo p
    join public.user_sucursal us on us.sucursal_id = p.sucursal_id
    where p.id = hr_periodo_totales.periodo_id and us.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.hr_periodo p
    join public.user_sucursal us on us.sucursal_id = p.sucursal_id
    where p.id = hr_periodo_totales.periodo_id and us.user_id = auth.uid()
  )
);