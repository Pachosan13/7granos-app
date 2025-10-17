-- Esquema de planilla para 7 Granos
-- Ejecutar manualmente en Supabase SQL Editor

create extension if not exists "uuid-ossp";

-- Empleados (por sucursal)
create table if not exists public.hr_empleado (
  id uuid primary key default uuid_generate_v4(),
  sucursal_id uuid not null references public.sucursal(id) on delete cascade,
  cedula text,
  nombre text not null,
  cargo text,
  salario_base numeric(12,2) default 0,
  activo boolean default true,
  created_at timestamptz default now()
);

-- Catálogo de códigos de planilla (modelo alto)
-- tipo: earning | deduction | tax | employer_contrib
create table if not exists public.hr_codigo (
  code text primary key,
  descripcion text,
  tipo text not null check (tipo in ('earning','deduction','tax','employer_contrib'))
);

-- Períodos de planilla
create table if not exists public.hr_periodo (
  id uuid primary key default uuid_generate_v4(),
  sucursal_id uuid not null references public.sucursal(id) on delete cascade,
  periodo_mes int not null check (periodo_mes between 1 and 12),
  periodo_ano int not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  estado text not null check (estado in ('borrador','calculado','aprobado','pagado')) default 'borrador',
  created_at timestamptz default now(),
  unique (sucursal_id, periodo_mes, periodo_ano)
);

-- Entradas "tall" (cada fila = empleado + código + monto)
create table if not exists public.hr_entry (
  id uuid primary key default uuid_generate_v4(),
  sucursal_id uuid not null references public.sucursal(id) on delete cascade,
  periodo_id uuid not null references public.hr_periodo(id) on delete cascade,
  empleado_id uuid not null references public.hr_empleado(id) on delete cascade,
  code text not null references public.hr_codigo(code),
  qty numeric(12,4) default 1,
  monto numeric(12,2) not null,
  centro text,
  created_at timestamptz default now()
);

-- Deducciones contractuales (préstamos/adelantos/etc.)
-- prioridad: menor número = se descuenta primero
create table if not exists public.hr_deduccion (
  id uuid primary key default uuid_generate_v4(),
  sucursal_id uuid not null references public.sucursal(id) on delete cascade,
  empleado_id uuid not null references public.hr_empleado(id) on delete cascade,
  tipo text not null check (tipo in ('LOAN','ADVANCE','GARNISHMENT','OTHER')),
  monto_total numeric(12,2) not null,
  saldo numeric(12,2) not null,
  cuota_periodo numeric(12,2) not null,
  prioridad int not null default 1,
  inicio date not null,
  fin date,
  activo boolean default true,
  created_at timestamptz default now()
);

-- Resultados por empleado en un período (acumulados)
create table if not exists public.hr_resultado (
  id uuid primary key default uuid_generate_v4(),
  periodo_id uuid not null references public.hr_periodo(id) on delete cascade,
  empleado_id uuid not null references public.hr_empleado(id) on delete cascade,
  bruto numeric(12,2) not null default 0,
  deducciones_legales numeric(12,2) not null default 0,      -- placeholder (0 en este paso)
  deducciones_contractuales numeric(12,2) not null default 0,
  neto numeric(12,2) not null default 0,
  detalle jsonb,  -- opcional: breakdown por código
  created_at timestamptz default now(),
  unique (periodo_id, empleado_id)
);

-- Semilla mínima de códigos (idempotente)
insert into public.hr_codigo (code, descripcion, tipo) values
 ('BASE_SAL','Salario base','earning'),
 ('OT_DAY','Horas extra diurnas','earning'),
 ('OT_NIGHT','Horas extra nocturnas','earning'),
 ('BONUS','Bonificaciones','earning'),
 ('TIPS','Propinas','earning'),
 ('ISR','Impuesto sobre la Renta','tax'),
 ('CSS_EMP','CSS empleado','tax'),
 ('EDU_EMP','Seguro educativo empleado','tax'),
 ('LOAN','Cuota de préstamo','deduction'),
 ('ADVANCE','Adelanto salarial','deduction'),
 ('NET','Salario neto','earning')
on conflict do nothing;