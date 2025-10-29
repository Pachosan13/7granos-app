-- sync empleados tabla y politicas
create table if not exists public.hr_empleado (
  id uuid primary key default gen_random_uuid(),
  invu_employee_id text,
  sucursal_id uuid not null,
  nombre text not null,
  email text,
  telefono text,
  rol text,
  salario_base numeric(12,2) default 0,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists hr_empleado_unq
  on public.hr_empleado (sucursal_id, invu_employee_id);

alter table public.hr_empleado enable row level security;

drop policy if exists anon_can_select_hr_empleado on public.hr_empleado;
create policy anon_can_select_hr_empleado
  on public.hr_empleado
  for select
  to anon
  using (activo = true);

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists tg_set_updated_at_hr_empleado on public.hr_empleado;
create trigger tg_set_updated_at_hr_empleado
  before update on public.hr_empleado
  for each row execute function public.tg_set_updated_at();

grant execute on function public.rpc_hr_calcular_periodo(uuid) to anon, authenticated;
