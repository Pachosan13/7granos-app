# Siguientes mejoras sugeridas

1. **Integración backend para ajustes manuales de planilla**
   - Endpoint seguro para registrar y auditar ajustes manuales, incluyendo usuario, monto, motivo y periodo afectado.
   - Permitir revertir ajustes y notificar a contabilidad.
2. **Sincronización real de marcaciones**
   - Exponer vista `v_ui_attendance` o RPC que devuelva marcaciones filtradas por sucursal y periodo.
   - Agregar flag de consistencia para detectar registros duplicados o faltantes.
3. **API de gastos fijos**
   - Crear CRUD en Supabase (o servicio intermedio) para listar, crear y marcar como pagados los gastos recurrentes.
   - Considerar estados adicionales (programado, vencido) y adjuntos.
4. **Importador de gastos fijos**
   - Persistir manifiesto y filas validadas en almacenamiento seguro.
   - Agregar reconciliación automática con cuentas contables.
5. **Pruebas E2E Playwright**
   - Automatizar smoke tests para payroll (crear periodo, ajuste manual) y gastos fijos (importación básica).
