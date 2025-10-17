import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Row = {
  sucursal_id: string;
  nombre: string;
  mode: 'percent' | 'inventory';
  percent: number | null;
};

export const AdminTab = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from('sucursal')
      .select('id,nombre,cont_cogs_policy (mode,percent)')
      .leftJoin('cont_cogs_policy','cont_cogs_policy.sucursal_id','sucursal.id');
    if (error) { console.error(error); return; }
    const out: Row[] = (data as any[]).map((s:any)=>({
      sucursal_id: s.id,
      nombre: s.nombre,
      mode: s.cont_cogs_policy?.mode ?? 'percent',
      percent: s.cont_cogs_policy?.percent ?? 35,
    }));
    setRows(out);
  };

  useEffect(()=>{ load(); }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      for (const r of rows) {
        const { error } = await supabase
          .from('cont_cogs_policy')
          .upsert({ sucursal_id: r.sucursal_id, mode: r.mode, percent: r.percent }, { onConflict: 'sucursal_id' });
        if (error) throw error;
      }
      setMsg('Guardado');
    } catch (e:any) {
      setMsg(`Error: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const setRow = (i:number, patch: Partial<Row>) => {
    setRows(curr => curr.map((r, idx)=> idx===i ? { ...r, ...patch } : r));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={load} className="px-3 py-2 rounded bg-bean text-white">Recargar</button>
        <button onClick={save} className="px-3 py-2 rounded bg-accent text-white" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-off">
            <tr>
              <th className="p-2 text-left">Sucursal</th>
              <th className="p-2 text-left">Modo</th>
              <th className="p-2 text-right">% COGS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.sucursal_id} className="border-t">
                <td className="p-2">{r.nombre}</td>
                <td className="p-2">
                  <select value={r.mode} onChange={e=>setRow(i,{ mode: e.target.value as any })} className="border rounded px-2 py-1">
                    <option value="percent">Percent</option>
                    <option value="inventory">Inventory</option>
                  </select>
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number" step="0.01" min={0} max={100}
                    value={r.percent ?? 0}
                    onChange={e=>setRow(i,{ percent: Number(e.target.value) })}
                    className="border rounded px-2 py-1 w-28 text-right"
                    disabled={r.mode !== 'percent'}
                  />
                </td>
              </tr>
            ))}
            {rows.length===0 && <tr><td className="p-4 text-center" colSpan={3}>Sin sucursales</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
