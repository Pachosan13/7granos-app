/*
  # Políticas de Seguridad (RLS) para Roles y Multi-sucursal

  1. Seguridad por Tabla
    - Habilita RLS en todas las tablas principales
    - Políticas de lectura basadas en roles y permisos
    - Bloquea escritura desde cliente (solo lectura por ahora)

  2. Lógica de Permisos
    - Admin/Contador: Ven todas las sucursales
    - Gerente: Solo ve sucursales asignadas en user_sucursal
    - Usuarios solo ven su propio perfil y asignaciones
*/

alter table public.sucursal enable row level security;
alter table public.user_profile enable row level security;
alter table public.user_sucursal enable row level security;

-- Leer mi perfil
create policy "read my profile" on public.user_profile
  for select using (user_profile.user_id = auth.uid());

-- Leer sucursales: admin/contador ven todas; gerente solo asignadas
create policy "read sucursal by role or membership" on public.sucursal
  for select using (
    exists (select 1 from public.user_profile p where p.user_id = auth.uid() and p.rol in ('admin','contador'))
    or exists (select 1 from public.user_sucursal us where us.sucursal_id = sucursal.id and us.user_id = auth.uid())
  );

-- Leer solo mis filas de user_sucursal
create policy "read my user_sucursal" on public.user_sucursal
  for select using (user_id = auth.uid());

-- Bloquear escritura desde cliente (por ahora)
create policy "block user_profile writes" on public.user_profile for insert with check (false);
create policy "block user_profile updates" on public.user_profile for update using (false);
create policy "block sucursal writes" on public.sucursal for insert with check (false);
create policy "block sucursal updates" on public.sucursal for update using (false);
create policy "block user_sucursal writes" on public.user_sucursal for insert with check (false);
create policy "block user_sucursal updates" on public.user_sucursal for update using (false);