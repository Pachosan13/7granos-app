import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { postJournalsInRange, toISODate } from '../../lib/contabilidad';

export const MayorTab = () => {
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDesde(today);
    setHasta(today);
  }, []);

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
    } catch (e: any) {
      setMsg(`Error: ${e?.message || e}`);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control rápido para postear rango */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="text-xs text-slate7g">Desde</label>
          <input type="date" value={desde} onChange={(e)=>setDesde(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-slate7g">Hasta</label>
          <input type="date" value={hasta} onChange={(e)=>setHasta(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <button onClick={postRange} className="px-3 py-2 rounded bg-accent text-white" disabled={posting}>
          {posting ? 'Posteando…' : 'Postear rango'}
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>

      <div className="text-center py-12">
        <FileText className="mx-auto h-16 w-16 text-slate7g mb-4" />
        <h3 className="text-2xl font-bold text-bean mb-2">Libro Mayor</h3>
        <p className="text-slate7g text-lg">
          Vista del mayor general por cuenta - Próximamente
        </p>
      </div>
    </div>
  );
};
