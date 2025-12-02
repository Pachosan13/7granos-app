import { FormEvent, useMemo, useState } from 'react';
import { CalendarRange, Building2, BadgeCheck, AlertTriangle, FilePlus2 } from 'lucide-react';
import { AjusteContable, ajustesMock } from '../../mocks/conciliacion';
import { formatDateDDMMYYYY, money } from '../../lib/format';

const estadoOptions: Array<{ value: 'todos' | AjusteContable['estado']; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobado', label: 'Aprobado' },
  { value: 'rechazado', label: 'Rechazado' },
];

const motivoOptions: Array<{ value: 'todos' | AjusteContable['motivo']; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'diferencia_banco', label: 'Diferencia banco' },
  { value: 'error_invu', label: 'Error INVU' },
  { value: 'error_humano', label: 'Error humano' },
  { value: 'otro', label: 'Otro' },
];

const estadoBadgeClass: Record<AjusteContable['estado'], string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  aprobado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
};

const motivoText: Record<AjusteContable['motivo'], string> = {
  diferencia_banco: 'Diferencia banco',
  error_invu: 'Error INVU',
  error_humano: 'Error humano',
  otro: 'Otro',
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

const StatsCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-sand p-4 bg-off shadow-sm">
    <p className="text-sm text-slate-500 mb-1">{label}</p>
    <p className="text-2xl font-bold text-bean">{value}</p>
  </div>
);

const NuevoAjusteModal = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const [fecha, setFecha] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [cuentaDebito, setCuentaDebito] = useState('');
  const [cuentaCredito, setCuentaCredito] = useState('');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState<AjusteContable['motivo']>('diferencia_banco');
  const [descripcion, setDescripcion] = useState('');

  const sucursalOptions = useMemo(() => {
    const unique = new Map<string, string>();
    ajustesMock.forEach((item) => {
      if (!unique.has(item.sucursalId)) {
        unique.set(item.sucursalId, item.sucursalNombre);
      }
    });
    return Array.from(unique.entries());
  }, []);

  const handleSubmit = (evt: FormEvent<HTMLFormElement>) => {
    evt.preventDefault();
    const payload = {
      fecha,
      sucursalId,
      cuentaDebito,
      cuentaCredito,
      monto: Number(monto),
      motivo,
      descripcion,
    };
    // DEMO: en el sistema real, aquí se enviaría el nuevo asiento de ajuste para aprobación.
    // eslint-disable-next-line no-console
    console.log('Nuevo ajuste (demo)', payload);
    alert('Modo DEMO: ajuste simulado. No se guardan cambios.');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full border border-sand p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-bean">Nuevo ajuste</h3>
            <p className="text-sm text-slate-600">
              Modo DEMO: este formulario ilustra cómo se registrarían los asientos de ajuste; no se guardan
              cambios reales.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-bean transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col text-sm text-slate-700 gap-2">
              <span className="font-semibold flex items-center gap-2">
                <CalendarRange size={16} /> Fecha
              </span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
                required
              />
            </label>

            <label className="flex flex-col text-sm text-slate-700 gap-2">
              <span className="font-semibold flex items-center gap-2">
                <Building2 size={16} /> Sucursal
              </span>
              <select
                value={sucursalId}
                onChange={(e) => setSucursalId(e.target.value)}
                className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
                required
              >
                <option value="">Seleccione</option>
                {sucursalOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col text-sm text-slate-700 gap-2">
              <span className="font-semibold">Cuenta débito</span>
              <input
                type="text"
                value={cuentaDebito}
                onChange={(e) => setCuentaDebito(e.target.value)}
                className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
                required
              />
            </label>

            <label className="flex flex-col text-sm text-slate-700 gap-2">
              <span className="font-semibold">Cuenta crédito</span>
              <input
                type="text"
                value={cuentaCredito}
                onChange={(e) => setCuentaCredito(e.target.value)}
                className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
                required
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col text-sm text-slate-700 gap-2">
              <span className="font-semibold">Monto</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
                required
              />
            </label>

            <label className="flex flex-col text-sm text-slate-700 gap-2">
              <span className="font-semibold">Motivo</span>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as AjusteContable['motivo'])}
                className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
              >
                {motivoOptions
                  .filter((item) => item.value !== 'todos')
                  .map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col text-sm text-slate-700 gap-2">
            <span className="font-semibold">Descripción</span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
              rows={3}
            />
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-sand text-slate-700 hover:bg-off transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-bean text-white font-semibold hover:bg-bean/90 transition-colors"
            >
              Guardar ajuste
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AjustesContablesPage = () => {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [sucursal, setSucursal] = useState('todas');
  const [estado, setEstado] = useState<'todos' | AjusteContable['estado']>('todos');
  const [motivo, setMotivo] = useState<'todos' | AjusteContable['motivo']>('todos');
  const [showModal, setShowModal] = useState(false);

  const sucursalOptions = useMemo(() => {
    const unique = new Set<string>();
    ajustesMock.forEach((item) => unique.add(item.sucursalNombre));
    return Array.from(unique);
  }, []);

  const filteredRows = useMemo(() => {
    return ajustesMock.filter((row) => {
      const matchDate = (!desde && !hasta) || withinRange(row.fecha, desde || row.fecha, hasta || row.fecha);
      const matchSucursal = sucursal === 'todas' || row.sucursalNombre === sucursal;
      const matchEstado = estado === 'todos' || row.estado === estado;
      const matchMotivo = motivo === 'todos' || row.motivo === motivo;
      return matchDate && matchSucursal && matchEstado && matchMotivo;
    });
  }, [estado, desde, hasta, motivo, sucursal]);

  const resumen = useMemo(
    () =>
      filteredRows.reduce(
        (acc, row) => {
          acc.total += 1;
          acc.monto += row.monto;
          if (row.estado === 'pendiente') acc.pendiente += row.monto;
          if (row.estado === 'aprobado') acc.aprobado += row.monto;
          return acc;
        },
        { total: 0, monto: 0, pendiente: 0, aprobado: 0 }
      ),
    [filteredRows]
  );

  const handleAccion = (row: AjusteContable) => {
    // DEMO: in the real system, this would open the full adjustment record and approval workflow.
    // eslint-disable-next-line no-console
    console.log('Ajuste seleccionado', row);
    alert('Vista demo: aquí se abriría el detalle completo del ajuste.');
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm uppercase text-slate-500 font-semibold mb-1">Contabilidad</p>
          <h1 className="text-4xl font-bold text-bean tracking-tight">Ajustes contables</h1>
          <p className="text-slate-600 mt-1">
            Asientos de ajuste generados para corregir diferencias entre INVU, bancos y contabilidad.
          </p>
        </div>
      </div>

      <div className="mb-6 text-slate-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
        Este módulo está en modo DEMO usando asientos de ejemplo para mostrar el flujo de ajustes contables.
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
              <BadgeCheck size={16} /> Estado
            </span>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as typeof estado)}
              className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
            >
              {estadoOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm text-slate-700 gap-2 md:col-span-2 lg:col-span-4">
            <span className="font-semibold flex items-center gap-2">
              <AlertTriangle size={16} /> Motivo
            </span>
            <div className="flex flex-wrap gap-2">
              {motivoOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMotivo(opt.value)}
                  className={`px-4 py-2 rounded-lg border transition-all ${
                    motivo === opt.value
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
        <h2 className="text-xl font-semibold text-bean mb-4">Resumen de ajustes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard label="Total ajustes" value={`${resumen.total}`} />
          <StatsCard label="Monto total" value={money(resumen.monto)} />
          <StatsCard label="Monto pendiente" value={money(resumen.pendiente)} />
          <StatsCard label="Monto aprobado" value={money(resumen.aprobado)} />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-sand p-6">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-bean">Detalle de ajustes</h2>
            <p className="text-sm text-slate-500">{filteredRows.length} registros</p>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bean text-white font-semibold hover:bg-bean/90 transition-colors"
          >
            <FilePlus2 size={16} /> Nuevo ajuste
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-sm text-slate-600 border-b border-sand">
                <th className="py-3 pr-3 font-semibold">Fecha</th>
                <th className="py-3 pr-3 font-semibold">Sucursal</th>
                <th className="py-3 pr-3 font-semibold">Cuenta débito</th>
                <th className="py-3 pr-3 font-semibold">Cuenta crédito</th>
                <th className="py-3 pr-3 font-semibold">Monto</th>
                <th className="py-3 pr-3 font-semibold">Motivo</th>
                <th className="py-3 pr-3 font-semibold">Estado</th>
                <th className="py-3 pr-3 font-semibold">Creado por</th>
                <th className="py-3 pr-3 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {filteredRows.map((row) => (
                <tr key={row.id} className="text-sm text-slate-700">
                  <td className="py-3 pr-3 whitespace-nowrap">{formatDateDDMMYYYY(row.fecha)}</td>
                  <td className="py-3 pr-3">{row.sucursalNombre}</td>
                  <td className="py-3 pr-3">{row.cuentaDebito}</td>
                  <td className="py-3 pr-3">{row.cuentaCredito}</td>
                  <td className="py-3 pr-3 font-semibold">{money(row.monto)}</td>
                  <td className="py-3 pr-3">{motivoText[row.motivo]}</td>
                  <td className="py-3 pr-3">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${estadoBadgeClass[row.estado]}`}>
                      {row.estado.charAt(0).toUpperCase() + row.estado.slice(1)}
                    </span>
                  </td>
                  <td className="py-3 pr-3">{row.creadoPor}</td>
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
                    No hay ajustes que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NuevoAjusteModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
};

export default AjustesContablesPage;
