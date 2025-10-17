/*
  # Schema para Roles y Multi-sucursal - 7 Granos

  1. Tablas Principales
    - `sucursal`: Registro de sucursales (El Cangrejo, San Francisco, etc.)
    - `user_profile`: Perfil de usuario con rol (admin, contador, gerente)
    - `user_sucursal`: Relación usuario ↔ sucursal (permisos de acceso)

  2. Vista Práctica
    - `v_mis_sucursales`: Vista que combina sucursales con permisos del usuario

  3. Datos Iniciales
    - Se crean las 4 sucursales principales de 7 Granos
*/

create extension if not exists "uuid-ossp";

-- Sucursales
create table if not exists public.sucursal (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  activa boolean default true,
  created_at timestamptz default now()
);

-- Perfil de usuario con rol
create table if not exists public.user_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('admin','contador','gerente')) default 'gerente',
  created_at timestamptz default now()
);

-- Relación usuario ↔ sucursal (qué puede ver)
create table if not exists public.user_sucursal (
  user_id uuid references public.user_profile(user_id) on delete cascade,
  sucursal_id uuid references public.sucursal(id) on delete cascade,
  primary key (user_id, sucursal_id)
);

-- Vista práctica para el frontend
create or replace view public.v_mis_sucursales as
select us.user_id, s.id as sucursal_id, s.nombre, s.activa
from public.user_sucursal us
join public.sucursal s on s.id = us.sucursal_id;

-- Insertar sucursales iniciales
insert into public.sucursal (nombre) values 
  ('El Cangrejo'),
  ('San Francisco'),
  ('Costa del Este'),
  ('Museo')
on conflict do nothing;