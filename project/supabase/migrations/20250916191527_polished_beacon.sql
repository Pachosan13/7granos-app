/*
  # Sistema de Importación y Sincronización INVU

  1. Nuevas Tablas
    - `invu_credenciales` - Credenciales INVU por sucursal
    - `invu_cursor` - Cursor incremental por dataset (ventas, compras, inventario, productos)
    - `sync_log` - Log de sincronizaciones (CSV o API)

  2. Extensiones
    - uuid-ossp para generación de UUIDs

  3. Estructura
    - Todas las tablas están relacionadas con sucursales
    - Sistema de cursor para sincronización incremental
    - Log completo de todas las operaciones de importación
*/

create extension if not exists "uuid-ossp";

-- Credenciales INVU por sucursal (se almacenan aquí; token se renueva)
create table if not exists public.invu_credenciales (
  id uuid primary key default uuid_generate_v4(),
  sucursal_id uuid not null references public.sucursal(id) on delete cascade,
  usuario text not null,
  password text not null,
  token text,
  token_expires_at timestamptz,
  created_at timestamptz default now(),
  unique (sucursal_id)
);

-- Cursor incremental por dataset (ventas, compras, inventario, productos)
create table if not exists public.invu_cursor (
  id uuid primary key default uuid_generate_v4(),
  sucursal_id uuid not null references public.sucursal(id) on delete cascade,
  dataset text not null check (dataset in ('ventas','compras','inventario','productos')),
  last_sync_at timestamptz,
  created_at timestamptz default now(),
  unique (sucursal_id, dataset)
);

-- Log de sincronizaciones (CSV o API)
create table if not exists public.sync_log (
  id uuid primary key default uuid_generate_v4(),
  sucursal_id uuid not null references public.sucursal(id) on delete cascade,
  tipo text not null check (tipo in ('planilla','ventas','compras')),
  origen text not null check (origen in ('csv','api')),
  started_at timestamptz default now(),
  finished_at timestamptz,
  estado text not null check (estado in ('ok','error','pendiente')) default 'pendiente',
  mensaje text,
  manifest_path text,   -- ruta del JSON de manifiesto en Storage
  file_path text        -- ruta del CSV en Storage (si aplica)
);