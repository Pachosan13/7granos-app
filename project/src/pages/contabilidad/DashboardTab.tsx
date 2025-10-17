// src/pages/contabilidad/DashboardTab.tsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { postJournalsInRange, toISODate } from '../../lib/contabilidad';

type Row = {
  fecha: string;
  sucursal_id: string | null;
  ventas_netas: number | null;
  itbms: number | null;
  num_transacciones: number | null;
};

export const DashboardTab = () => {
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [sucursales, setSucursales] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Inicializa fechas al día de hoy
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDesde(today);
    setHasta(today);
  }, []);

  // Cargar catálogo de sucursales (para mostrar nombre)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('sucursal')
        .select('id,nombre,activa');
      if (error) {
        console.error(error);
        return;
      }
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: any) => {
        map[s.id] = s.nombre;
      });
      setSucursales(map);
    })();
  }, []);

  // Traer datos del dashboard (ventas por día/sucursal)
  const fetchData = async () => {
    if (!desde || !hasta) return;
    setLoading(true);
    setMsg(null);
    try {
      const { data, error } = await supabase
        .from('ventas_por_dia_sucursal')
        .select('fecha,sucursal_id,ventas_netas,itbms,num_transacciones')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false });

      if (error) {
        console.error(error);
        setMsg(error.message);
        setRows([]);
      } else {
        setRows((data as Row[]) ?? []);
      }
    } catch (e: any) {
      console.error(e);
      setMsg(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [desde, hasta]);

  const refetchResumen = async () => {
    await fetchData();
  };

  const totals = useMemo(() => {
    return (rows ?? []).reduce(
      (acc, r) => {
        acc.ventas_netas += Number(r.ventas_netas ?? 0);
        acc.itbms += Number(r.itbms ?? 0);
        acc.num_transacciones += Number(r.num_transacciones ?? 0);
        return acc;
      },
      { ventas_netas: 0, itbms: 0, num_transacciones: 0 }
    );
  }, [rows]);

  // ✅ Generar asientos / postear journals via RPC (sin Edge Function)
  const handleGenerarAsientos = async () => {
    setPosting(true);
    setMsg(null);
    try {
      await postJournalsInRange({
        desde: toISODate(desde),
        hasta: toISODate(hasta),
        sucursalId: null, // o el id seleccionado si agregas filtro
      });
      setMsg('OK: asientos posteados en el rango');
      await refetchResumen();
    } catch (e: any) {
      console.error(e);
      setMsg(`Error: ${e?.message || e}`);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="text-xs text-slate7g">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate7g">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
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
          onClick={handleGenerarAsientos}
          className="px-3 py-2 rounded bg-accent text-white"
          disabled={posting || loading}
          title="Postea journals en el rango usando RPC directo"
        >
          {posting ? 'Generando…' : 'Generar asientos'}
        </button>

        {msg && <span className="text-sm">{msg}</span>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border p-4">
          <div className="text-slate7g text-sm">Ventas Netas</div>
          <div className="text-2xl font-bold">
            ${totals.ventas_netas.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-slate7g text-sm">ITBMS</div>
          <div className="text-2xl font-bold">
            ${totals.itbms.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-slate7g text-sm">Transacciones</div>
          <div className="text-2xl font-bold">
            {totals.num_transacciones.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Tabla detalle */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-off">
            <tr>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">Sucursal</th>
              <th className="p-2 text-right">Ventas Netas</th>
              <th className="p-2 text-right">ITBMS</th>
              <th className="p-2 text-right">Transacciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{r.fecha}</td>
                <td className="p-2">
                  {r.sucursal_id ? sucursales[r.sucursal_id] ?? r.sucursal_id : '—'}
                </td>
                <td className="p-2 text-right">
                  ${Number(r.ventas_netas ?? 0).toLocaleString()}
                </td>
                <td className="p-2 text-right">
                  ${Number(r.itbms ?? 0).toLocaleString()}
                </td>
                <td className="p-2 text-right">
                  {Number(r.num_transacciones ?? 0).toLocaleString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-center text-slate7g" colSpan={5}>
                  Sin datos en el rango
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
