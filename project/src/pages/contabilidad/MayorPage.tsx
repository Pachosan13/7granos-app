import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Filter, Loader2, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthOrg } from '../../context/AuthOrgContext';
import {
  formatDateIso,
  rpcWithFallback,
  toNumber,
  type RpcParams,
} from './rpcHelpers';
import { formatCurrencyUSD } from '../../lib/format';
import { exportToCsv, exportToXlsx, formatNumber } from './exportUtils';

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface MayorRawRow {
  fecha?: string;
  journal_date?: string;
  journalDate?: string;
  date?: string;
  doc_id?: string;
  docId?: string;
  journal_id?: string;
  account_code?: string;
  accountCode?: string;
  cuenta?: string;
  cuenta_nombre?: string;
  cuentaNombre?: string;
  description?: string;
  concepto?: string;
  debe?: number | string | null;
  debit?: number | string | null;
  debito?: number | string | null;
  haber?: number | string | null;
  credit?: number | string | null;
  credito?: number | string | null;
  sucursal_id?: string | null;
  sucursalId?: string | null;
  sucursal?: string | null;
}

interface MayorRow {
  fecha: string;
  cuenta: string;
  cuentaNombre: string;
  descripcion: string;
  debe: number;
  haber: number;
  sucursalId: string | null;
  docId: string | null;
  saldo: number;
}

type ContAccountRow = {
  id?: string | number;
  code?: string | number | null;
  name?: string | null;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Error desconocido';
};

const buildVariants = (
  desde: string,
  hasta: string,
  sucursalId: string | null,
  cuenta: string | null
): RpcParams[] => [
  { p_desde: desde, p_hasta: hasta, p_sucursal_id: sucursalId, p_cuenta: cuenta },
  { desde, hasta, p_sucursal_id: sucursalId, p_cuenta: cuenta },
  { desde, hasta, sucursal_id: sucursalId, p_cuenta: cuenta },
  { desde, hasta, sucursal_id: sucursalId, cuenta },
  { desde, hasta, sucursalId, cuenta },
  { p_desde: desde, p_hasta: hasta, sucursal_id: sucursalId, cuenta },
];

export const MayorPage = () => {
  const { sucursales, sucursalSeleccionada } = useAuthOrg();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [selectedSucursal, setSelectedSucursal] = useState<string>('');
  const [accountQuery, setAccountQuery] = useState('');
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [rows, setRows] = useState<MayorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    setDesde(firstDay);
    setHasta(today.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    if (sucursalSeleccionada?.id) {
      setSelectedSucursal(String(sucursalSeleccionada.id));
    }
  }, [sucursalSeleccionada?.id]);

  useEffect(() => {
    (async () => {
      const { data, error: accountsError } = await supabase
        .from('cont_account')
        .select('id,code,name')
        .eq('is_active', true)
        .order('code');
      if (accountsError) {
        console.warn('[contabilidad] error cargando cuentas', accountsError);
        return;
      }
      const rows = (data as ContAccountRow[] | null) ?? [];
      setAccounts(
        rows.map((row) => ({
          id: String(row.id ?? ''),
          code: row.code ? String(row.code) : '',
          name: row.name ? String(row.name) : '',
        }))
      );
    })();
  }, []);

  const fetchMayor = useCallback(async () => {
    if (!desde || !hasta) return;
    setLoading(true);
    setError(null);
    try {
      const sucursalId = selectedSucursal || null;
      const cuenta = accountQuery ? accountQuery.trim() : null;
      const data =
        (await rpcWithFallback<MayorRawRow[]>(
          'api_get_mayor',
          buildVariants(desde, hasta, sucursalId, cuenta)
        )) ?? [];

      const sorted = [...data]
        .map<MayorRow>((row) => {
          const fecha =
            row.fecha ||
            row.journal_date ||
            row.journalDate ||
            row.date ||
            '';
          const cuentaCodigo =
            row.cuenta ||
            row.account_code ||
            row.accountCode ||
            '';
          const cuentaNombre =
            row.cuenta_nombre ||
            row.cuentaNombre ||
            '';
          const descripcion = row.description || row.concepto || '';
          const debe = toNumber(row.debe ?? row.debit ?? row.debito);
          const haber = toNumber(row.haber ?? row.credit ?? row.credito);
          const sucursal =
            (row.sucursal_id ?? row.sucursalId ?? row.sucursal ?? null) ?? null;
          const docId = row.doc_id || row.docId || row.journal_id || null;
          return {
            fecha: fecha ? fecha.slice(0, 10) : '',
            cuenta: cuentaCodigo,
            cuentaNombre,
            descripcion,
            debe,
            haber,
            sucursalId: sucursal,
            docId,
            saldo: 0,
          };
        })
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.cuenta.localeCompare(b.cuenta));

      let running = 0;
      const withBalance = sorted.map((row) => {
        running += row.debe - row.haber;
        return { ...row, saldo: running };
      });

      setRows(withBalance);
    } catch (err: unknown) {
      console.error('Error cargando api_get_mayor', err);
      setRows([]);
      setError(getErrorMessage(err) ?? 'No fue posible obtener el libro mayor.');
    } finally {
      setLoading(false);
    }
  }, [accountQuery, desde, hasta, selectedSucursal]);

  useEffect(() => {
    fetchMayor();
  }, [fetchMayor]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.debe += row.debe;
        acc.haber += row.haber;
        acc.saldo = row.saldo;
        return acc;
      },
      { debe: 0, haber: 0, saldo: 0 }
    );
  }, [rows]);

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    const csvRows = rows.map((row) => [
      row.fecha,
      row.cuenta,
      row.cuentaNombre.replaceAll(',', ' '),
      row.descripcion.replaceAll(',', ' '),
      formatNumber(row.debe),
      formatNumber(row.haber),
      formatNumber(row.saldo),
    ]);
    exportToCsv(csvRows, ['Fecha', 'Cuenta', 'Nombre cuenta', 'Concepto', 'Debe', 'Haber', 'Saldo'], {
      suffix: 'mayor',
    });
  };

  const handleExportXlsx = () => {
    if (rows.length === 0) return;
    const data = rows.map((row) => ({
      Fecha: row.fecha,
      Cuenta: row.cuenta,
      'Nombre cuenta': row.cuentaNombre,
      Concepto: row.descripcion,
      Debe: row.debe,
      Haber: row.haber,
      Saldo: row.saldo,
    }));
    exportToXlsx(data, 'Mayor', { suffix: 'mayor' });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-bean">Libro Mayor</h1>
          <p className="text-slate7g">Movimientos contables consolidados por sucursal.</p>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {rows.length} movimientos visibles
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportXlsx}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-bean px-4 py-2 text-white shadow disabled:opacity-60"
          >
            <FileSpreadsheet size={16} /> Exportar XLSX
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-sand px-4 py-2 text-sm text-bean shadow-sm disabled:opacity-60"
          >
            <Download size={16} /> CSV
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-5">
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(event) => setDesde(event.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Hasta
            <input
              type="date"
              value={hasta}
              onChange={(event) => setHasta(event.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Sucursal
            <select
              value={selectedSucursal}
              onChange={(event) => setSelectedSucursal(event.target.value)}
              className="rounded-xl border border-sand px-3 py-2"
            >
              <option value="">Todas mis sucursales</option>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="md:col-span-2 flex flex-col gap-2 text-sm text-slate7g">
            Cuenta (código)
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                list="cont-accounts"
                placeholder="Ej. 4-01 Ingresos"
                value={accountQuery}
                onChange={(event) => setAccountQuery(event.target.value)}
                className="w-full rounded-xl border border-sand px-3 py-2 pl-9"
              />
              <datalist id="cont-accounts">
                {accounts.map((account) => (
                  <option key={account.id} value={account.code}>
                    {account.code} · {account.name}
                  </option>
                ))}
              </datalist>
            </div>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <Filter size={14} />
          <span>
            {sucursales.length} sucursales disponibles • {accounts.length} cuentas activas
          </span>
          <button
            type="button"
            onClick={fetchMayor}
            className="rounded-lg border border-sand px-3 py-1 text-sm text-bean hover:border-bean"
          >
            Actualizar
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-sand bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-sand text-sm">
            <thead className="bg-off/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cuenta</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3 text-right">Debe</th>
                <th className="px-4 py-3 text-right">Haber</th>
                <th className="px-4 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/70">
              {rows.map((row, index) => (
                <tr key={`${row.docId ?? index}-${index}`} className="hover:bg-off/40">
                  <td className="px-4 py-2 text-slate7g">{formatDateIso(row.fecha)}</td>
                  <td className="px-4 py-2">
                    <div className="font-semibold text-slate-800">{row.cuenta || '—'}</div>
                    <div className="text-xs text-slate-500">{row.cuentaNombre || 'Sin nombre'}</div>
                  </td>
                  <td className="px-4 py-2 text-slate7g">{row.descripcion || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono text-sm">
                    {formatCurrencyUSD(row.debe)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm">
                    {formatCurrencyUSD(row.haber)}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono text-sm ${
                    row.saldo >= 0 ? 'text-green-700' : 'text-rose-600'
                  }`}>
                    {formatCurrencyUSD(row.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando movimientos…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            No se encontraron movimientos para el rango seleccionado.
          </div>
        )}
        {error && (
          <div className="px-4 py-4 text-center text-sm text-rose-600">{error}</div>
        )}
        {rows.length > 0 && (
          <footer className="flex flex-wrap items-center justify-end gap-6 border-t border-sand px-4 py-4 text-sm font-semibold text-slate-700">
            <span>Total debe: {formatCurrencyUSD(totals.debe)}</span>
            <span>Total haber: {formatCurrencyUSD(totals.haber)}</span>
            <span>Saldo acumulado: {formatCurrencyUSD(totals.saldo)}</span>
          </footer>
        )}
      </section>
    </div>
  );
};

export default MayorPage;
