import { useMemo, useState } from 'react';
import {
  Banknote,
  CalendarRange,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Clock3,
} from 'lucide-react';
import {
  archivosMock,
  movimientosMock,
  BancoSoportado,
  MovimientoBancario,
  getResumenConciliacion,
} from '../../mocks/conciliacionBancaria';
import { formatDateDDMMYYYY, money } from '../../lib/format';

const bancos: Array<{ value: BancoSoportado | 'todos'; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'BAC', label: 'BAC' },
  { value: 'Banistmo', label: 'Banistmo' },
  { value: 'Banco General', label: 'Banco General' },
];

const estadoBadge: Record<MovimientoBancario['estado'], string> = {
  conciliado: 'bg-green-100 text-green-700',
  pendiente: 'bg-amber-100 text-amber-700',
  diferencia: 'bg-red-100 text-red-700',
};

const conciliadoContraText: Record<NonNullable<MovimientoBancario['conciliadoContra']>, string> = {
  ventas: 'Ventas',
  gl: 'GL',
  ninguno: '—',
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

export const ConciliacionBancariaPage = () => {
  const [banco, setBanco] = useState<BancoSoportado | 'todos'>('todos');
  const [archivoId, setArchivoId] = useState<string>('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const archivosDisponibles = useMemo(
    () => (banco === 'todos' ? archivosMock : archivosMock.filter((archivo) => archivo.banco === banco)),
    [banco]
  );

  const archivoSeleccionado = useMemo(
    () => archivosMock.find((archivo) => archivo.id === archivoId),
    [archivoId]
  );

  const movimientosFiltrados = useMemo(() => {
    return movimientosMock.filter((mov) => {
      const matchBanco = banco === 'todos' || mov.banco === banco;

      const matchArchivo = archivoSeleccionado
        ? mov.banco === archivoSeleccionado.banco &&
          withinRange(mov.fecha, archivoSeleccionado.periodoDesde, archivoSeleccionado.periodoHasta)
        : true;

      const effectiveDesde = desde || (archivoSeleccionado ? archivoSeleccionado.periodoDesde : '');
      const effectiveHasta = hasta || (archivoSeleccionado ? archivoSeleccionado.periodoHasta : '');

      const matchFecha = withinRange(mov.fecha, effectiveDesde || mov.fecha, effectiveHasta || mov.fecha);

      return matchBanco && matchArchivo && matchFecha;
    });
  }, [archivoSeleccionado, banco, desde, hasta]);

  const resumen = useMemo(() => getResumenConciliacion(movimientosFiltrados), [movimientosFiltrados]);

  const counts = useMemo(
    () => ({
      total: movimientosFiltrados.length,
      conciliados: movimientosFiltrados.filter((m) => m.estado === 'conciliado').length,
      pendientes: movimientosFiltrados.filter((m) => m.estado === 'pendiente').length,
      diferencias: movimientosFiltrados.filter((m) => m.estado === 'diferencia').length,
    }),
    [movimientosFiltrados]
  );

  const handleAplicar = () => {
    // DEMO: filtros locales ya aplican en memoria; este botón es decorativo para el flujo.
    // eslint-disable-next-line no-console
    console.log('Aplicar filtros demo', { banco, archivoId, desde, hasta });
  };

  const handleUpload = () => {
    // DEMO: carga simulada
    // eslint-disable-next-line no-console
    console.log('DEMO upload');
    alert('Modo DEMO: la carga de archivos está simulada.');
  };

  const handleRevisar = (mov: MovimientoBancario) => {
    // DEMO: aquí se abrirá el detalle del movimiento y opciones para conciliar o crear ajustes contables.
    // eslint-disable-next-line no-console
    console.log('Revisar movimiento', mov);
    alert('Vista demo: aquí se revisaría el movimiento seleccionado.');
  };

  const diferenciaClass = resumen.diferenciaNeta === 0 ? 'text-slate-700' : 'text-red-700';
  const diferenciaBg = resumen.diferenciaNeta === 0 ? 'bg-slate-50' : 'bg-red-50';

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm uppercase text-slate-500 font-semibold mb-1">Contabilidad</p>
          <h1 className="text-4xl font-bold text-bean tracking-tight">Conciliación bancaria</h1>
          <p className="text-slate-600 mt-1">
            Importa extractos de bancos, concilia movimientos y revisa diferencias frente a ventas y contabilidad.
          </p>
        </div>
      </div>

      <div className="mb-6 text-slate-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
        Este módulo está en modo DEMO usando extractos de ejemplo para ilustrar el flujo de conciliación bancaria.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 mb-6">
        <div className="bg-white rounded-2xl shadow-lg border border-sand p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-bean">Filtros</h2>
            <button
              type="button"
              onClick={handleAplicar}
              className="px-4 py-2 bg-bean text-white rounded-lg font-semibold hover:bg-bean/90 transition"
            >
              Aplicar
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <label className="flex flex-col text-sm text-slate-700 gap-2">
              <span className="font-semibold flex items-center gap-2">
                <Banknote size={16} /> Banco
              </span>
              <select
                value={banco}
                onChange={(e) => setBanco(e.target.value as BancoSoportado | 'todos')}
                className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
              >
                {bancos.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-sm text-slate-700 gap-2">
              <span className="font-semibold flex items-center gap-2">
                <FileSpreadsheet size={16} /> Archivo
              </span>
              <select
                value={archivoId}
                onChange={(e) => setArchivoId(e.target.value)}
                className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
              >
                <option value="todos">Todos los archivos</option>
                {archivosDisponibles.map((archivo) => (
                  <option key={archivo.id} value={archivo.id}>
                    {`${archivo.nombreArchivo} (${formatDateDDMMYYYY(archivo.periodoDesde)} - ${formatDateDDMMYYYY(
                      archivo.periodoHasta
                    )})`}
                  </option>
                ))}
              </select>
            </label>

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
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-sand p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-bean">Importar archivo</h3>
              <p className="text-sm text-slate-600">Sube extractos en CSV para conciliar tus movimientos.</p>
            </div>
            <UploadCloud className="text-bean" />
          </div>
          <button
            type="button"
            onClick={handleUpload}
            className="w-full px-4 py-2 bg-bean text-white rounded-lg font-semibold hover:bg-bean/90 transition"
          >
            Subir extracto (CSV)
          </button>
          <p className="text-xs text-slate-500">Modo DEMO: la carga de archivos está simulada.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-sand p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-bean">Resumen de conciliación bancaria</h2>
            <p className="text-slate-600 text-sm">
              Movimientos conciliados, pendientes y con diferencia basados en los extractos seleccionados.
            </p>
          </div>
          <span className="text-xs bg-bean/10 text-bean px-3 py-1 rounded-full font-semibold">Demo mock</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="border border-sand rounded-xl p-4 bg-slate-50">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Movimientos conciliados</span>
              <CheckCircle2 className="text-green-600" size={18} />
            </div>
            <div className="mt-2 text-2xl font-bold text-bean">{resumen.conciliado.cantidad}</div>
            <p className="text-sm text-slate-600">Monto total {money(resumen.conciliado.monto)}</p>
          </div>

          <div className="border border-sand rounded-xl p-4 bg-slate-50">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Pendientes</span>
              <Clock3 className="text-amber-600" size={18} />
            </div>
            <div className="mt-2 text-2xl font-bold text-bean">{resumen.pendiente.cantidad}</div>
            <p className="text-sm text-slate-600">Monto total {money(resumen.pendiente.monto)}</p>
          </div>

          <div className="border border-sand rounded-xl p-4 bg-slate-50">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Con diferencia</span>
              <AlertCircle className="text-red-600" size={18} />
            </div>
            <div className="mt-2 text-2xl font-bold text-bean">{resumen.diferencia.cantidad}</div>
            <p className="text-sm text-slate-600">Monto total {money(resumen.diferencia.monto)}</p>
          </div>

          <div className={`border border-sand rounded-xl p-4 ${diferenciaBg}`}>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Diferencia neta</span>
              <AlertCircle className={resumen.diferenciaNeta === 0 ? 'text-slate-500' : 'text-red-600'} size={18} />
            </div>
            <div className={`mt-2 text-2xl font-bold ${diferenciaClass}`}>{money(resumen.diferenciaNeta)}</div>
            <p className="text-sm text-slate-600">Suma de movimientos marcados con diferencia</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-sand p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-semibold text-bean">Detalle de movimientos</h2>
            <p className="text-slate-600 text-sm">{`${counts.total} registros · ${counts.conciliados} conciliados · ${counts.pendientes} pendientes · ${counts.diferencias} con diferencia`}</p>
          </div>
        </div>
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="min-w-full text-sm text-slate-700">
            <thead>
              <tr className="text-left text-slate-500 border-b border-sand">
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Banco</th>
                <th className="px-4 py-2">Cuenta</th>
                <th className="px-4 py-2">Descripción</th>
                <th className="px-4 py-2">Referencia</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Monto</th>
                <th className="px-4 py-2">Conciliado contra</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {movimientosFiltrados.map((mov) => (
                <tr key={mov.id} className="border-b border-sand last:border-0">
                  <td className="px-4 py-3">{formatDateDDMMYYYY(mov.fecha)}</td>
                  <td className="px-4 py-3">{mov.banco}</td>
                  <td className="px-4 py-3">{mov.cuenta}</td>
                  <td className="px-4 py-3">{mov.descripcion}</td>
                  <td className="px-4 py-3">{mov.referencia}</td>
                  <td className="px-4 py-3 capitalize">{mov.tipo}</td>
                  <td className="px-4 py-3 font-semibold text-bean">{money(mov.monto)}</td>
                  <td className="px-4 py-3">{conciliadoContraText[mov.conciliadoContra ?? 'ninguno']}</td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${estadoBadge[mov.estado]}`}>
                      {mov.estado === 'conciliado'
                        ? 'Conciliado'
                        : mov.estado === 'pendiente'
                        ? 'Pendiente'
                        : 'Diferencia'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRevisar(mov)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-bean rounded-lg hover:bg-bean/90 transition"
                    >
                      Revisar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ConciliacionBancariaPage;
