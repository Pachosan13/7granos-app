## Objetivo
Frontend módulo **Planilla** (solo lectura). **No tocar backend, SQL ni funciones**.

## Cambios
- [ ] EmployeesPage (`/payroll/empleados`)
- [ ] PeriodsPage (`/payroll`)
- [ ] AttendancePage (`/payroll/marcaciones`)
- [ ] Hooks de lectura a Supabase (select only)
- [ ] Rutas y Sidebar (links detrás de flags)
- [ ] README_PAYROLL.md / CHANGES.md

## Data sources usados (read-only)
- `v_hr_empleado_clean`
- `hr_entry`
- `hr_periodo`
- *(opcional)* `hr_deduccion` (modo lectura)

## Guardrails
- Rama: `feat/payroll-ui` (nunca `main`)
- Solo PRs (sin merge directo)
- Status checks verdes: build, lint, typecheck
- Sin writes a BD (solo `.from(...).select(...)`)
- Sin cambios en `supabase/**`, `supabase/functions/**`, SQL, `package.json`, `tsconfig.json`, `.github/workflows/**`

## Feature Flags
- `FF_PAYROLL_EMPLOYEES`
- `FF_PAYROLL_PERIODS`
- `FF_PAYROLL_MARCACIONES`
- `FF_PAYROLL_ADMIN`

## Pruebas manuales
1. Ir a `/payroll/empleados` → lista, búsqueda, “solo activos”, excluir `cargo = 'Sistema'`.
2. Ir a `/payroll` → períodos desde `hr_periodo`, KPIs chicos (empleados activos, marcaciones en rango).
3. Ir a `/payroll/marcaciones` → filtros por sucursal/período/fechas; join visual con nombre del empleado.

## Riesgos
- Mínimos. UI read-only detrás de flags. Sin migraciones ni lógica backend.

## Notas
- Si falta algo de datos, dejar en modo lectura y **preguntar antes de inventar**.
