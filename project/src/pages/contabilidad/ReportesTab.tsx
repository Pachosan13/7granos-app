// src/pages/contabilidad/ReportesTab.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { postJournalsInRange } from '../../lib/contabilidad';
import { formatCurrencyUSD as money } from '../../lib/format';

type Row = {
  mes: string; // YYYY-MM-01
  sucursal_id: string | null;
  ingresos: number | null;
  cogs: number | null;
  gastos: number | null;
  margen_bruto: number | null;
  utilidad_operativa: number | null;
};

export const ReportesTab = () => {
  const [desdeMes, setDesdeMes] = useState<string>('');
  const [hastaMes, setHastaMes] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [sucursales, setSucursales] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Mes actual por defecto
  useEffect(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const ym = `${y}-${m}`;
    setDesdeMes(ym);
    setHastaMes(ym);
  }, []);

  // Mapa id -> nombre de sucursal
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('sucursal').select('id,nombre');
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: any) => (map[s.id] = s.nombre));
      setSucursales(map);
    })();
  }, []);

  const fetchData = useCallback(async () => {
    if (!desdeMes || !hastaMes) return;
    setLoading(true);
    setFetchError(null);
    const desde = `${desdeMes}-01`;
    const hasta = `${hastaMes}-01`;
    const viewName = previewMode ? 'v_pnl_mensual_preview' : 'vw_pyg_mensual_sucursal';

    try {
      const { data, error } = await supabase
        .from(viewName)
        .select('*')
        .gte('mes', desde)
        .lte('mes', hasta)
        .order('mes', { ascending: false });

      if (error) throw error;
      setRows((data as Row[]) ?? []);
    } catch (error) {
      console.error(error);
      setRows([]);
      const message = previewMode
        ? 'Preview no disponible: asegúrate de crear las vistas v_ingresos_mensual_sucursal, v_cogs_mensual_sucursal, v_gastos_mensual_sucursal y v_pnl_mensual_preview.'
        : 'Error cargando datos contables.';
      setFetchError(message);
    } finally {
      setLoading(false);
    }
  }, [desdeMes, hastaMes, previewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Agrupa filas por mes
  const grouped = useMemo(() => {
    const byMes: Record<string, Row[]> = {};
    for (const r of rows) {
      (byMes[r.mes] ||= []).push(r);
    }
    return byMes;
  }, [rows]);

  const sum = (arr: Row[]) =>
    arr.reduce(
      (acc, r) => {
        acc.ingresos += Number(r.ingresos || 0);
        acc.cogs += Number(r.cogs || 0);
        acc.gastos += Number(r.gastos || 0);
        acc.margen_bruto += Number(r.margen_bruto || 0);
        acc.utilidad_operativa += Number(r.utilidad_operativa || 0);
        return acc;
      },
      { ingresos: 0, cogs: 0, gastos: 0, margen_bruto: 0, utilidad_operativa: 0 }
    );

  // Postear meses completos (1er al último día)
  const postMonths = async () => {
    if (!desdeMes || !hastaMes) return;
    setPosting(true);
    setMsg(null);
    try {
      const [y2, m2] = hastaMes.split('-').map(Number);
      const desde = `${desdeMes}-01`;
      const lastDay = new Date(y2, m2, 0).getDate();
      const hasta = `${hastaMes}-${String(lastDay).padStart(2, '0')}`;

      await postJournalsInRange({ desde, hasta, sucursalId: null });
      setMsg('OK: journals posteados en los meses seleccionados');
      await fetchData();
    } catch (e: any) {
      setMsg(`Error: ${e?.message || e}`);
    } finally {
      setPosting(false);
    }
  };

  const viewBadge = previewMode ? 'PREVIEW P&L (LECTURA)' : 'POSTEADO (LEGACY)';

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col">
            <label className="text-xs text-slate-700">Desde (mes)</label>
            <input
              type="month"
              value={desdeMes}
              onChange={(e) => setDesdeMes(e.target.value)}
              className="border rounded px-2 py-1"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-700">Hasta (mes)</label>
            <input
              type="month"
              value={hastaMes}
              onChange={(e) => setHastaMes(e.target.value)}
              className="border rounded px-2 py-1"
            />
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-2 rounded bg-bean text-white"
            disabled={loading || posting}
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
          <button
            onClick={postMonths}
            className="px-3 py-2 rounded bg-accent text-white"
            disabled={posting || loading}
            title="Postea journals de los meses seleccionados vía RPC"
          >
            {posting ? 'Posteando…' : 'Postear meses'}
          </button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={previewMode}
              onChange={(e) => setPreviewMode(e.target.checked)}
              className="h-4 w-4 rounded border-slate-400 text-bean focus:ring-bean"
            />
            Preview P&L (lectura)
          </label>
          <span className="text-xs uppercase tracking-wide text-slate-500">{viewBadge}</span>
        </div>

        {fetchError && (
          <div className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {fetchError}
          </div>
        )}
      </div>

      {/* Tablas por mes */}
      {Object.entries(grouped).map(([mes, arr]) => {
        // 1) Fila consolidada (sucursal_id = NULL)
        const consolidated = arr.find((r) => r.sucursal_id === null) || null;
        // 2) Sucursales reales
        const branches = arr.filter((r) => r.sucursal_id !== null);
        // 3) Totales (si hay consolidado lo usamos; si no, sum(branches))
        const branchTotals = sum(branches);
        const totals = consolidated ?? {
          mes,
          sucursal_id: null,
          ...branchTotals,
        };

        const niceMes = new Date(mes).toLocaleDateString('es-PA', {
          year: 'numeric',
          month: 'long',
        });

        return (
          <div key={mes} className="rounded-2xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-off border-b">
              <div className="text-lg font-semibold">{niceMes}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Sucursal</th>
                    <th className="p-2 text-right">Ingresos</th>
                    <th className="p-2 text-right">COGS</th>
                    <th className="p-2 text-right">Gastos</th>
                    <th className="p-2 text-right">Margen Bruto</th>
                    <th className="p-2 text-right">Utilidad Operativa</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        {r.sucursal_id ? sucursales[r.sucursal_id] ?? r.sucursal_id : 'Consolidado'}
                      </td>
                      <td className="p-2 text-right">{money(Number(r.ingresos || 0))}</td>
                      <td className="p-2 text-right">{money(Number(r.cogs || 0))}</td>
                      <td className="p-2 text-right">{money(Number(r.gastos || 0))}</td>
                      <td className="p-2 text-right">{money(Number(r.margen_bruto || 0))}</td>
                      <td className="p-2 text-right">{money(Number(r.utilidad_operativa || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t font-semibold">
                    <td className="p-2 text-right">{consolidated ? 'Consolidado' : 'Total'}</td>
                    <td className="p-2 text-right">{money(Number(totals.ingresos || 0))}</td>
                    <td className="p-2 text-right">{money(Number(totals.cogs || 0))}</td>
                    <td className="p-2 text-right">{money(Number(totals.gastos || 0))}</td>
                    <td className="p-2 text-right">{money(Number(totals.margen_bruto || 0))}</td>
                    <td className="p-2 text-right">{money(Number(totals.utilidad_operativa || 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      {rows.length === 0 && !loading && !fetchError && (
        <div className="text-slate-700">
          {previewMode ? (
            <>No hay datos en la vista de <b>preview</b> para el rango seleccionado.</>
          ) : (
            <>No hay asientos <b>posteados</b> en el rango seleccionado.</>
          )}
        </div>
      )}
    </div>
  );
};

