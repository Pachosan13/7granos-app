import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { postJournalsInRange, toISODate } from '../../lib/contabilidad';

type Journal = {
  id: string;
  journal_date: string;
  description: string | null;
  status: 'pending' | 'posted' | 'void';
  created_at: string;
  doc_id: string | null;
};
type Doc = { id: string; sucursal_id: string | null; source: string | null; total: number | null; };
type Bal = { journal_id: string; total_debit: number | null; total_credit: number | null; delta: number | null; };

export const DiarioTab = () => {
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const [rows, setRows] = useState<(Journal & { balance?: Bal; doc?: Doc })[]>([]);
  const [sucursales, setSucursales] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0,10);
    setDesde(today);
    setHasta(today);
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('sucursal').select('id,nombre');
      if (!error) {
        const map: Record<string,string> = {};
        (data ?? []).forEach((s:any) => map[s.id]=s.nombre);
        setSucursales(map);
      }
    })();
  }, []);

  const fetchData = async () => {
    if (!desde || !hasta) return;
    setLoading(true);
    try {
      // 1) journals
      let q = supabase
        .from('cont_journal')
        .select('id,journal_date,description,status,created_at,doc_id')
        .gte('journal_date', desde)
        .lte('journal_date', hasta)
        .order('journal_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (onlyPending) q = q.eq('status','pending');

      const { data: journals, error } = await q;
      if (error) throw error;

      const ids = (journals ?? []).map((j:any)=>j.id);
      const docIds = (journals ?? []).map((j:any)=>j.doc_id).filter(Boolean);

      // 2) balances
      let balances: Bal[] = [];
      if (ids.length) {
        const { data: bal, error: errBal } = await supabase
          .from('cont_journal_balance')
          .select('*')
          .in('journal_id', ids);
        if (!errBal) balances = bal as Bal[];
      }

      // 3) docs
      let docs: Doc[] = [];
      if (docIds.length) {
        const { data: d, error: errDoc } = await supabase
          .from('cont_doc')
          .select('id,sucursal_id,source,total')
          .in('id', docIds as string[]);
        if (!errDoc) docs = d as Doc[];
      }

      const balById = new Map(balances.map(b => [b.journal_id, b]));
      const docById = new Map(docs.map(d => [d.id, d]));
      const merged = (journals ?? []).map((j:any) => ({
        ...j,
        balance: balById.get(j.id),
        doc: j.doc_id ? docById.get(j.doc_id) : undefined,
      }));

      setRows(merged);
    } catch (e: any) {
      console.error(e);
      setMsg(String(e?.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [desde, hasta, onlyPending]);

  // ✅ Postear rango vía RPC directo
  const postRange = async () => {
    setPosting(true);
    setMsg(null);
    try {
      await postJournalsInRange({
        desde: toISODate(desde),
        hasta: toISODate(hasta),
        sucursalId: null,
      });
      setMsg('OK: journals posteados en el rango');
      await fetchData();
    } catch (e:any) {
      setMsg(`Error: ${e?.message || e}`);
    } finally {
      setPosting(false);
    }
  };

  const totalDebe = useMemo(() => rows.reduce((a,r)=>a+Number(r.balance?.total_debit ?? 0), 0), [rows]);
  const totalHaber = useMemo(() => rows.reduce((a,r)=>a+Number(r.balance?.total_credit ?? 0), 0), [rows]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="text-xs text-slate7g">Desde</label>
          <input type="date" value={desde} onChange={e=>setDesde(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate7g">Hasta</label>
          <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyPending} onChange={e=>setOnlyPending(e.target.checked)} />
          <span className="text-sm">Solo pendientes</span>
        </label>
        <button onClick={fetchData} className="px-3 py-2 rounded bg-bean text-white" disabled={loading || posting}>
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
        <button onClick={postRange} className="px-3 py-2 rounded bg-accent text-white" disabled={posting || loading} title="Postea journals del rango vía RPC">
          {posting ? 'Posteando…' : 'Postear rango'}
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4">
          <div className="text-slate7g text-sm">Total Debe</div>
          <div className="text-2xl font-bold">${totalDebe.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-slate7g text-sm">Total Haber</div>
          <div className="text-2xl font-bold">${totalHaber.toLocaleString()}</div>
        </div>
      </div>

      {/* Tabla diario */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-off">
            <tr>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">Sucursal</th>
              <th className="p-2 text-left">Descripción</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-right">Debe</th>
              <th className="p-2 text-right">Haber</th>
              <th className="p-2 text-right">Δ</th>
              <th className="p-2 text-left">Origen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id} className="border-t">
                <td className="p-2">{j.journal_date}</td>
                <td className="p-2">{j.doc?.sucursal_id ? (sucursales[j.doc.sucursal_id] ?? j.doc.sucursal_id) : '—'}</td>
                <td className="p-2">{j.description}</td>
                <td className="p-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${j.status==='posted' ? 'bg-green-100 text-green-700' : j.status==='pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-700'}`}>
                    {j.status}
                  </span>
                </td>
                <td className="p-2 text-right">${Number(j.balance?.total_debit ?? 0).toLocaleString()}</td>
                <td className="p-2 text-right">${Number(j.balance?.total_credit ?? 0).toLocaleString()}</td>
                <td className="p-2 text-right">${Number(j.balance?.delta ?? 0).toLocaleString()}</td>
                <td className="p-2">{j.doc?.source ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-4 text-center text-slate7g" colSpan={8}>Sin journals en el rango</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
