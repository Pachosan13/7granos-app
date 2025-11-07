// src/pages/contabilidad/DashboardTab.tsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type Row = {
  fecha: string;
  sucursal_id: string | null;
  ventas_netas: number | null;
  itbms: number | null;
  num_transacciones: number | null;
};

type Sucursal = { id: string; nombre: string; activa: boolean };

const iso = (d: string | Date) =>
  (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10);

export const DashboardTab = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // ===== Filtros (persisten en URL) =====
  const today = useMemo(() => iso(new Date()), []);
  const [desde, setDesde] = useState<string>(searchParams.get('desde') ?? today);
  const [hasta, setHasta] = useState<string>(searchParams.get('hasta') ?? today);
  const [sucursalId, setSucursalId] = useState<string | 'all'>(
    (searchParams.get('sucursal') as 'all' | string) ?? 'all'
  );

  // ===== Catálogo de sucursales =====
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const sucursalMap = useMemo(
    () =>
      Object.fromEntries(
        (sucursales ?? []).map((s) => [s.id, s.nombre] as const)
      ),
    [sucursales]
  );

  // ===== Datos =====
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ---- Sincroniza filtros -> URL
  useEffect(() => {
    const params: Record<string, string> = { desde, hasta };
    if (sucursalId !== 'all') params.sucursal = String(sucursalId);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, sucursalId]);

  // ---- Cargar sucursales
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('sucursal')
        .select('id,nombre,activa')
        .order('nombre', { ascending: true });
      if (error) {
        console.error('sucursal list error:', error);
        return;
      }
      setSucursales((data as Sucursal[]) ?? []);
    })();
  }, []);

  // ---- Traer resumen
  const fetchData = async () => {
    if (!desde || !hasta) return;
    setLoading(true);
    setMsg(null);
    try {
      let q = supabase
        // ⛳️ Si tu vista tiene otro nombre, cámbialo aquí:
        .from('ventas_por_dia_sucursal')
        .select('fecha,sucursal_id,ventas_netas,itbms,num_transacciones')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false });

      if (sucursalId !== 'all') q = q.eq('sucursal_id', sucursalId);

      const { data, error } = await q;
      if (error) throw error;
      setRows((data as Row[]) ?? []);
    } catch (e: any) {
      console.error(e);
      setRows([]);
      setMsg(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, sucursalId]);

  // ---- Totales
  const totals = useMemo(
    () =>
      (rows ?? []).reduce(
        (acc, r) => {
          acc.ventas_netas += Number(r.ventas_netas ?? 0);
          acc.itbms += Number(r.itbms ?? 0);
          acc.num_transacciones += Number(r.num_transacciones ?? 0);
          return acc;
        },
        { ventas_netas: 0, itbms: 0, num_transacciones: 0 }
      ),
    [rows]
  );

  // ---- Postear asientos a libro mayor (Edge Function cont-post-asientos)
  const handleGenerarAsientos = async () => {
    if (!desde || !hasta) return;
    setPosting(true);
    setMsg(null);
    try {
      const body: Record<string, any> = { desde, hasta };
      if (sucursalId !== 'all') body.sucursal = sucursalId;

      const { data, error } = await supabase.functions.invoke(
        'cont-post-asientos',
        { body }
      );
      if (error) throw error;

      setMsg(
        `OK: asientos posteados (${data?.posted ?? `${desde}..${hasta}`})${
          data?.sucursal ? ` · sucursal: ${data.sucursal}` : ''
        }`
      );
      await fetchData();
    } catch (e: any) {
      console.error(e);
      setMsg(`Error: ${e?.message || String(e)}`);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-slate-600">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-600">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate-600">Sucursal</label>
          <select
            value={sucursalId}
            onChange={(e) => setSucursalId(e.target.value as any)}
            className="border rounded px-2 py-1 min-w-[220px]"
          >
            <option value="all">Todas mis sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} {s.activa ? '' : '(inactiva)'}
              </option>
            ))}
          </select>
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
          title="Postea journals en el rango usando cont-post-asientos"
        >
          {posting ? 'Generando…' : 'Generar asientos'}
        </button>

        {msg && (
          <span
            className={`text-sm ${
              msg.startsWith('OK') ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {msg}
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border p-4">
          <div className="text-slate-600 text-sm">Ventas Netas</div>
          <div className="text-2xl font-bold">
            ${totals.ventas_netas.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-slate-600 text-sm">ITBMS</div>
          <div className="text-2xl font-bold">
            ${totals.itbms.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-slate-600 text-sm">Transacciones</div>
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
                  {r.sucursal_id ? sucursalMap[r.sucursal_id] ?? r.sucursal_id : '—'}
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
                <td className="p-4 text-center text-slate-600" colSpan={5}>
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
