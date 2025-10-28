import { test, expect } from '@playwright/test';

const PERIODO_SF = 'b882cb07-4ca7-41ec-9b02-3d1139cb66a3';

const functionsEndpoint = 'http://localhost:8787/functions/v1/sync_empleados';

const mockSyncResponse = {
  ok: true,
  results: [
    { sucursal_id: PERIODO_SF, count: 4 },
  ],
};

test.describe('Payroll calcular – sincronización de empleados', () => {
  test('permite sincronizar empleados y recalcular planilla en modo admin', async ({ page }) => {
    await page.route(functionsEndpoint, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSyncResponse),
      });
    });

    await page.route('https://demo.supabase.co/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    });

    await page.goto(`/payroll/calcular?periodo=${PERIODO_SF}`);

    const syncButton = page.getByRole('button', { name: 'Sincronizar empleados' });
    await expect(syncButton).toBeVisible();

    await syncButton.click();
    await expect(page.getByText('Empleados sincronizados')).toBeVisible();

    const calcularButton = page.getByRole('button', { name: 'Calcular planilla' });
    await calcularButton.click();

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(3);

    await expect(page.getByRole('heading', { name: 'Resumen de totales' })).toBeVisible();
  });
});
