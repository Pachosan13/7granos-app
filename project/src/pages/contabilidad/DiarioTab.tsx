import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { postJournalsInRange, toISODate } from '../../lib/contabilidad';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { formatCurrencyUSD } from '../../lib/format';
import { formatDateIso, rpcWithFallback, toNumber, type RpcParams } from './rpcHelpers';
import { useContAccounts } from './hooks';

interface DiarioRawRow {
  fecha?: string;
  journal_date?: string;
  date?: string;
  created_at?: string;
  journal_id?: string;
  journalId?: string;
  line_id?: string;
  lineId?: string;
  account_code?: string;
  accountCode?: string;
  cuenta?: string;
  account_name?: string;
  accountName?: string;
  cuenta_nombre?: string;
  descripcion?: string;
  description?: string;
  memo?: string;
  concepto?: string;
  ref?: string;
  referencia?: string;
  source?: string;
  origen?: string;
  doc_ref?: string;
  sucursal_id?: string | null;
  sucursalId?: string | null;
  sucursal?: string | null;
  debe?: number | string | null;
  debit?: number | string | null;
  debito?: number | string | null;
  haber?: number | string | null;
  credit?: number | string | null;
  credito?: number | string | null;
  saldo?: number | string | null;
  balance?: number | string | null;
  running_balance?: number | string | null;
}

interface DiarioRow {
  journalId: string | null;
  lineId: string | null;
  fecha: string;
  cuenta: string;
  cuentaNombre: string;
  descripcion: string;
  debe: number;
  haber: number;
  saldo: number;
  sucursalId: string | null;
  ref: string | null;
  source: string | null;
}

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
];

const normalizeRow = (row: DiarioRawRow): DiarioRow => {
  const fecha =
    row.fecha ||
    row.journal_date ||
    row.date ||
    row.created_at ||
    '';
  const cuenta =
    row.cuenta ||
    row.account_code ||
    row.accountCode ||
    '';
  const cuentaNombre =
    row.cuenta_nombre ||
    row.account_name ||
    row.accountName ||
    '';
  const descripcion =
    row.descripcion ||
    row.description ||
    row.memo ||
    row.concepto ||
    '';
  const debe = toNumber(row.debe ?? row.debit ?? row.debito);
  const haber = toNumber(row.haber ?? row.credit ?? row.credito);
  const saldo = toNumber(row.saldo ?? row.balance ?? row.running_balance);
  const sucursal =
    (row.sucursal_id ?? row.sucursalId ?? row.sucursal ?? null) ?? null;
  const ref = row.ref || row.referencia || row.doc_ref || null;
  const source = row.source || row.origen || null;
  const journalId = row.journal_id || row.journalId || null;
  const lineId = row.line_id || row.lineId || null;

  return {
    journalId: journalId ? String(journalId) : null,
    lineId: lineId ? String(lineId) : null,
    fecha: fecha ? fecha.slice(0, 10) : '',
    cuenta: cuenta ? String(cuenta) : '',
    cuentaNombre: cuentaNombre ? String(cuentaNombre) : '',
    descripcion: descripcion ? String(descripcion) : '',
    debe,
    haber,
    saldo,
    sucursalId: sucursal ? String(sucursal) : null,
    ref: ref ? String(ref) : null,
    source: source ? String(source) : null,
  };
};

const PAGE_SIZE = 50;

export const DiarioTab = () => {
  const { sucursales } = useAuthOrg();
  const sucursalMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const sucursal of sucursales) {
      map[sucursal.id] = sucursal.nombre;
    }
    return map;
  }, [sucursales]);

  const { accounts } = useContAccounts();
  const [searchParams, setSearchParams] = useSearchParams();

  const [desde, setDesde] = useState(() => searchParams.get('desde') ?? new Date().toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(() => searchParams.get('hasta') ?? new Date().toISOString().slice(0, 10));
  const [selectedSucursal, setSelectedSucursal] = useState(() => searchParams.get('sucursal') ?? '');
  const [accountQuery, setAccountQuery] = useState(() => searchParams.get('cuenta') ?? '');
  const [rows, setRows] = useState<DiarioRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const syncSearchParams = useCallback(
    (next: Record<string, string | null | undefined>) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set('tab', 'diario');
        Object.entries(next).forEach(([key, value]) => {
          if (!value) {
            params.delete(key);
          } else {
            params.set(key, value);
          }
        });
        return params;
      });
    },
    [setSearchParams]
  );

  const fetchData = useCallback(async () => {
    if (!desde || !hasta) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    syncSearchParams({ desde, hasta, sucursal: selectedSucursal || null, cuenta: accountQuery || null });

    try {
      const sucursalId = selectedSucursal || null;
      const cuenta = accountQuery ? accountQuery.trim() : null;

      let data: DiarioRawRow[] = [];
      try {
        data =
          (await rpcWithFallback<DiarioRawRow[]>(
            'api_get_diario',
            buildVariants(desde, hasta, sucursalId, cuenta)
          )) ?? [];
      } catch (rpcError) {
        console.warn('[contabilidad] api_get_diario no disponible, usando vista vw_gl_diario', rpcError);
        let query = supabase
          .from('vw_gl_diario')
          .select(
            'journal_id,line_id,date,account_code,account_name,description,debit,credit,balance,sucursal_id,ref,source'
          )
          .gte('date', desde)
          .lte('date', hasta)
          .order('date', { ascending: true })
          .order('journal_id', { ascending: true });

        if (sucursalId) {
          query = query.eq('sucursal_id', sucursalId);
        }
        if (cuenta) {
          query = query.eq('account_code', cuenta);
        }

        const { data: fallbackData, error: fallbackError } = await query.limit(2000);
        if (fallbackError) {
          throw fallbackError;
        }
        data = (fallbackData as DiarioRawRow[] | null) ?? [];
      }

      const normalized = data.map(normalizeRow).sort((a, b) => {
        const byDate = a.fecha.localeCompare(b.fecha);
        if (byDate !== 0) return byDate;
        if (a.journalId && b.journalId) {
          const byJournal = a.journalId.localeCompare(b.journalId);
          if (byJournal !== 0) return byJournal;
        }
        return (a.lineId ?? '').localeCompare(b.lineId ?? '');
      });

      let running = 0;
      const withBalance = normalized.map((row) => {
        if (row.saldo !== 0) {
          running = row.saldo;
          return row;
        }
        running += row.debe - row.haber;
        return { ...row, saldo: running };
      });

      setRows(withBalance);
    } catch (err: unknown) {
      console.error('[contabilidad] error cargando libro diario', err);
      const message =
        err instanceof Error
          ? err.message
          : 'No fue posible obtener el libro diario en el rango seleccionado.';
      setRows([]);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [accountQuery, desde, hasta, selectedSucursal, syncSearchParams]);

  const handleRefresh = () => {
    setPage(1);
    fetchData();
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [desde, hasta, selectedSucursal, accountQuery]);

  const postRange = async () => {
    setPosting(true);
    setMessage(null);
    try {
      await postJournalsInRange({
        desde: toISODate(desde),
        hasta: toISODate(hasta),
        sucursalId: selectedSucursal || null,
      });
      setMessage('OK: journals posteados en el rango.');
      await fetchData();
    } catch (err: unknown) {
      console.error('[contabilidad] error posteando journals', err);
      const message = err instanceof Error ? err.message : 'Error posteando journals.';
      setMessage(message);
    } finally {
      setPosting(false);
    }
  };

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.debe += row.debe;
          acc.haber += row.haber;
          acc.saldo = row.saldo;
          return acc;
        },
        { debe: 0, haber: 0, saldo: 0 }
      ),
    [rows]
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginatedRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page]
  );

  const handlePrev = () => setPage((prev) => Math.max(1, prev - 1));
  const handleNext = () => setPage((prev) => Math.min(totalPages, prev + 1));

  return (
    <div className="space-y-6">
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
              <input
                list="cont-accounts-diario"
                placeholder="Ej. 1-01-01 Caja"
                value={accountQuery}
                onChange={(event) => setAccountQuery(event.target.value)}
                className="w-full rounded-xl border border-sand px-3 py-2"
              />
              <datalist id="cont-accounts-diario">
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
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg border border-sand px-3 py-1 text-sm text-bean hover:border-bean"
            disabled={loading}
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
          <button
            type="button"
            onClick={postRange}
            className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1 text-sm text-accent shadow-sm"
            disabled={posting || loading}
          >
            {posting ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Posteando…</span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Postear rango
              </span>
            )}
          </button>
          {message && <span className="text-sm text-slate-600">{message}</span>}
        </div>
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Debe</p>
          <p className="text-2xl font-semibold text-bean">{formatCurrencyUSD(totals.debe)}</p>
        </div>
        <div className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Haber</p>
          <p className="text-2xl font-semibold text-bean">{formatCurrencyUSD(totals.haber)}</p>
        </div>
        <div className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Saldo acumulado</p>
          <p className={`text-2xl font-semibold ${totals.saldo >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatCurrencyUSD(totals.saldo)}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-sand bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-sand text-sm">
            <thead className="bg-off/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cuenta</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Debe</th>
                <th className="px-4 py-3 text-right">Haber</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Referencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/70">
              {paginatedRows.map((row) => (
                <tr key={`${row.journalId ?? 'journal'}-${row.lineId ?? row.fecha}`} className="hover:bg-off/40">
                  <td className="px-4 py-2 text-slate7g">{formatDateIso(row.fecha)}</td>
                  <td className="px-4 py-2">
                    <div className="font-semibold text-slate-800">{row.cuenta || '—'}</div>
                    <div className="text-xs text-slate-500">{row.cuentaNombre || 'Sin nombre'}</div>
                  </td>
                  <td className="px-4 py-2 text-slate7g">{row.descripcion || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono text-sm">{formatCurrencyUSD(row.debe)}</td>
                  <td className="px-4 py-2 text-right font-mono text-sm">{formatCurrencyUSD(row.haber)}</td>
                  <td className={`px-4 py-2 text-right font-mono text-sm ${row.saldo >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCurrencyUSD(row.saldo)}
                  </td>
                  <td className="px-4 py-2 text-slate7g">
                    {row.sucursalId ? sucursalMap[row.sucursalId] ?? row.sucursalId : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate7g">
                    {row.ref ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {row.ref}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
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
        {!loading && paginatedRows.length === 0 && !error && (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            No se encontraron movimientos en el rango seleccionado.
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-sand px-4 py-3 text-sm text-slate-600">
          <span>
            Página {page} de {totalPages} · {rows.length} movimientos
          </span>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={page === 1}
              className="inline-flex items-center rounded-lg border border-sand px-3 py-1 text-sm text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={page === totalPages}
              className="inline-flex items-center rounded-lg border border-sand px-3 py-1 text-sm text-slate-600 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};
