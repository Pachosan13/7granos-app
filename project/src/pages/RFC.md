# RFC: Endpoints pendientes para Payroll y Gastos Fijos

## 1. Ajustes manuales de planilla
- **Objetivo**: Persistir los ajustes creados desde la UI de períodos.
- **Entrada**: `periodo_id`, `monto`, `motivo`, `creado_por`.
- **Salida**: Confirmación con `ajuste_id` y estado actual.
- **Notas**:
  - Registrar auditoría (timestamp, usuario, sucursal).
  - Permitir reversión y consulta histórica.

## 2. Marcaciones de asistencia
- **Objetivo**: Proveer API para listar marcaciones por sucursal, periodo y colaborador.
- **Entrada**: `sucursal_id`, `periodo` (YYYY-MM), `employee_id?`.
- **Salida**: Listado con `date`, `check_in`, `check_out`, `total_hours`, `fuente`.
- **Fallback**: Incluir RPC de reconciliación para detectar huecos o duplicados.

## 3. Gastos fijos
- **Objetivo**: Gestionar CRUD completo desde el front.
- **Entradas**:
  - POST: `sucursal_id`, `categoria`, `descripcion`, `monto`, `periodicidad`, `proveedor_id?`, `estado`.
  - PATCH: `estado`, `monto`, `periodo`, `notas`.
- **Salida**: Registro actualizado con metadatos.
- **Notas**:
  - Incluir vista agregada `v_ui_fixed_expenses` con filtros por periodo y estado.
  - Adjuntar soporte de archivos (contratos, facturas).

## 4. Importador de gastos fijos
- **Objetivo**: Almacenar manifiestos y filas parseadas.
- **Entrada**: Archivo CSV + JSON de preview (válidas/errores).
- **Salida**: Ruta en storage + log en `sync_log`.
- **Notas**:
  - Validar duplicados por periodo/proveedor.
  - Exponer endpoint para conciliar import con registros existentes.
