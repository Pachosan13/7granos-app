/*
  # Update sync_log table to include 'empleados' type

  1. Schema Changes
    - Modify the check constraint on sync_log.tipo column to include 'empleados'
    - This allows logging of employee import operations

  2. Security
    - No changes to RLS policies needed as they inherit from existing setup
*/

-- Drop the existing check constraint
ALTER TABLE sync_log DROP CONSTRAINT IF EXISTS sync_log_tipo_check;

-- Add the updated check constraint that includes 'empleados'
ALTER TABLE sync_log ADD CONSTRAINT sync_log_tipo_check 
  CHECK (tipo = ANY (ARRAY['planilla'::text, 'ventas'::text, 'compras'::text, 'empleados'::text]));