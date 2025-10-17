-- Políticas RLS para planilla
-- Ejecutar manualmente en Supabase SQL Editor

alter table public.hr_empleado enable row level security;
alter table public.hr_codigo enable row level security;
alter table public.hr_periodo enable row level security;
alter table public.hr_entry enable row level security;
alter table public.hr_deduccion enable row level security;
alter table public.hr_resultado enable row level security;

-- Regla: un usuario solo ve/gestiona filas de sus sucursales
create policy "hr_empleado by membership" on public.hr_empleado
  for all using (exists (select 1 from public.user_sucursal us where us.user_id = auth.uid() and us.sucursal_id = hr_empleado.sucursal_id))
  with check (exists (select 1 from public.user_sucursal us where us.user_id = auth.uid() and us.sucursal_id = hr_empleado.sucursal_id));

create policy "hr_periodo by membership" on public.hr_periodo
  for all using (exists (select 1 from public.user_sucursal us where us.user_id = auth.uid() and us.sucursal_id = hr_periodo.sucursal_id))
  with check (exists (select 1 from public.user_sucursal us where us.user_id = auth.uid() and us.sucursal_id = hr_periodo.sucursal_id));

create policy "hr_entry by membership" on public.hr_entry
  for all using (exists (select 1 from public.user_sucursal us where us.user_id = auth.uid() and us.sucursal_id = hr_entry.sucursal_id))
  with check (exists (select 1 from public.user_sucursal us where us.user_id = auth.uid() and us.sucursal_id = hr_entry.sucursal_id));

create policy "hr_deduccion by membership" on public.hr_deduccion
  for all using (exists (select 1 from public.user_sucursal us where us.user_id = auth.uid() and us.sucursal_id = hr_deduccion.sucursal_id))
  with check (exists (select 1 from public.user_sucursal us where us.user_id = auth.uid() and us.sucursal_id = hr_deduccion.sucursal_id));

create policy "hr_resultado by membership" on public.hr_resultado
  for all using (exists (select 1 from public.user_sucursal us where us.user_id = auth.uid()
                       and exists (select 1 from public.hr_periodo p where p.id = hr_resultado.periodo_id and p.sucursal_id = us.sucursal_id)))
  with check (true);

-- hr_codigo solo lectura para todos los autenticados
create policy "hr_codigo read" on public.hr_codigo for select using (auth.role() = 'authenticated');