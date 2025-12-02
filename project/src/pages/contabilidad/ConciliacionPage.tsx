import { useMemo, useState } from 'react';
import { CalendarRange, Building2, Banknote, ShieldCheck } from 'lucide-react';
import {
  ConciliacionRow,
  conciliacionMockRows,
  getConciliacionResumen,
  ConciliacionEstado,
} from '../../mocks/conciliacion';
import { formatDateDDMMYYYY, money } from '../../lib/format';

const estados: Array<{ value: 'todos' | ConciliacionEstado; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'ok', label: 'Ok' },
  { value: 'faltante', label: 'Faltante' },
  { value: 'sobrante', label: 'Sobrante' },
];

const estadoBadgeClass: Record<ConciliacionEstado, string> = {
  ok: 'bg-green-100 text-green-700',
  faltante: 'bg-red-100 text-red-700',
  sobrante: 'bg-amber-100 text-amber-700',
};

const estadoText: Record<ConciliacionEstado, string> = {
  ok: 'OK',
  faltante: 'Faltante',
  sobrante: 'Sobrante',
};

const parseDate = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const withinRange = (value: string, from: string, to: string) => {
  const date = parseDate(value);
  if (!date) return false;
  const fromDate = from ? parseDate(from) : null;
  const toDate = to ? parseDate(to) : null;

  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
};

export const ConciliacionPage = () => {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [sucursal, setSucursal] = useState('todas');
  const [banco, setBanco] = useState('todos');
  const [estado, setEstado] = useState<'todos' | ConciliacionEstado>('todos');

  const sucursalOptions = useMemo(() => {
    const unique = new Set<string>();
    conciliacionMockRows.forEach((row) => unique.add(row.sucursal));
    return Array.from(unique);
  }, []);

  const bancoOptions = useMemo(() => {
    const unique = new Set<string>();
    conciliacionMockRows.forEach((row) => unique.add(row.banco));
    return Array.from(unique);
  }, []);

  const filteredRows = useMemo(() => {
    return conciliacionMockRows.filter((row) => {
      const matchDate =
        (!desde && !hasta) ||
        withinRange(row.fecha, desde || row.fecha, hasta || row.fecha);
      const matchSucursal = sucursal === 'todas' || row.sucursal === sucursal;
      const matchBanco = banco === 'todos' || row.banco === banco;
      const matchEstado = estado === 'todos' || row.estado === estado;
      return matchDate && matchSucursal && matchBanco && matchEstado;
    });
  }, [banco, estado, desde, hasta, sucursal]);

  const resumen = useMemo(() => getConciliacionResumen(filteredRows), [filteredRows]);

  const handleAccion = (row: ConciliacionRow) => {
    // DEMO: en la versión real, este botón abrirá el detalle de conciliación y permitirá crear ajustes contables.
    // eslint-disable-next-line no-console
    console.log('Conciliación seleccionada', row);
    alert('Vista demo: aquí se abriría el detalle de la conciliación.');
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm uppercase text-slate-500 font-semibold mb-1">Contabilidad</p>
          <h1 className="text-4xl font-bold text-bean tracking-tight">Conciliación</h1>
        </div>
      </div>

      <div className="mb-6 text-slate-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
        Este módulo está en modo DEMO usando datos de ejemplo para ilustrar la conciliación entre INVU, GL y bancos.
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-sand p-6 mb-6">
        <h2 className="text-xl font-semibold text-bean mb-4">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="flex flex-col text-sm text-slate-700 gap-2">
            <span className="font-semibold flex items-center gap-2">
              <CalendarRange size={16} /> Desde
            </span>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
            />
          </label>

          <label className="flex flex-col text-sm text-slate-700 gap-2">
            <span className="font-semibold flex items-center gap-2">
              <CalendarRange size={16} /> Hasta
            </span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
            />
          </label>

          <label className="flex flex-col text-sm text-slate-700 gap-2">
            <span className="font-semibold flex items-center gap-2">
              <Building2 size={16} /> Sucursal
            </span>
            <select
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value)}
              className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
            >
              <option value="todas">Todas</option>
              {sucursalOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm text-slate-700 gap-2">
            <span className="font-semibold flex items-center gap-2">
              <Banknote size={16} /> Banco
            </span>
            <select
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
              className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
            >
              <option value="todos">Todos</option>
              {bancoOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm text-slate-700 gap-2 md:col-span-2 lg:col-span-4">
            <span className="font-semibold flex items-center gap-2">
              <ShieldCheck size={16} /> Estado
            </span>
            <div className="flex flex-wrap gap-2">
              {estados.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEstado(opt.value)}
                  className={`px-4 py-2 rounded-lg border transition-all ${
                    estado === opt.value
                      ? 'bg-bean text-white border-bean'
                      : 'bg-white text-slate-700 border-sand hover:border-bean'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-sand p-6 mb-6">
        <h2 className="text-xl font-semibold text-bean mb-4">Resumen de conciliación</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ResumenItem label="Ventas INVU" value={money(resumen.ventasInvu)} />
          <ResumenItem label="Ventas GL" value={money(resumen.ventasGl)} />
          <ResumenItem label="Depósitos banco" value={money(resumen.depositosBanco)} />
          <ResumenItem label="Diferencia total" value={money(resumen.diferencia)} emphasize />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-sand p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-bean">Detalle de conciliación</h2>
          <span className="text-sm text-slate-500">{filteredRows.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-sm text-slate-600 border-b border-sand">
                <th className="py-3 pr-3 font-semibold">Fecha</th>
                <th className="py-3 pr-3 font-semibold">Sucursal</th>
                <th className="py-3 pr-3 font-semibold">Ventas INVU</th>
                <th className="py-3 pr-3 font-semibold">Ventas GL</th>
                <th className="py-3 pr-3 font-semibold">Depósitos banco</th>
                <th className="py-3 pr-3 font-semibold">Diferencia</th>
                <th className="py-3 pr-3 font-semibold">Banco</th>
                <th className="py-3 pr-3 font-semibold">Estado</th>
                <th className="py-3 pr-3 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {filteredRows.map((row) => (
                <tr key={`${row.fecha}-${row.sucursal}-${row.banco}`} className="text-sm text-slate-700">
                  <td className="py-3 pr-3 whitespace-nowrap">{formatDateDDMMYYYY(row.fecha)}</td>
                  <td className="py-3 pr-3">{row.sucursal}</td>
                  <td className="py-3 pr-3">{money(row.ventasInvu)}</td>
                  <td className="py-3 pr-3">{money(row.ventasGl)}</td>
                  <td className="py-3 pr-3">{money(row.depositosBanco)}</td>
                  <td
                    className={`py-3 pr-3 font-semibold ${
                      row.diferencia === 0
                        ? 'text-slate-700'
                        : row.estado === 'faltante'
                          ? 'text-red-600'
                          : 'text-amber-600'
                    }`}
                  >
                    {money(row.diferencia)}
                  </td>
                  <td className="py-3 pr-3">{row.banco}</td>
                  <td className="py-3 pr-3">
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${estadoBadgeClass[row.estado]}`}
                    >
                      {estadoText[row.estado]}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleAccion(row)}
                      className="text-sm px-3 py-1.5 rounded-lg bg-bean text-white hover:bg-bean/90 transition-colors"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-500">
                    No hay registros que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ResumenItem = ({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) => (
  <div
    className={`rounded-xl border border-sand p-4 shadow-sm ${
      emphasize ? 'bg-amber-50 border-amber-200' : 'bg-off'
    }`}
  >
    <p className="text-sm text-slate-500 mb-1">{label}</p>
    <p className="text-2xl font-bold text-bean">{value}</p>
  </div>
);

export default ConciliacionPage;
