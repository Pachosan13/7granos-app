import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ProveedorSelect } from '../../components/ProveedorSelect';

type Sucursal = { id: string; nombre: string };

export default function CapturaComprasPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState<string>('');
  const [fecha, setFecha] = useState<string>('');
  const [factura, setFactura] = useState<string>('');
  const [subtotal, setSubtotal] = useState<string>('0');
  const [itbms, setItbms] = useState<string>('0');
  const [total, setTotal] = useState<string>('0');
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [proveedorTxt, setProveedorTxt] = useState<string>('');
  const [origen, setOrigen] = useState<string>('manual');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0,10);
    setFecha(today);
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('sucursal').select('id,nombre').eq('activa', true).order('nombre');
      if (!error) setSucursales(data as any);
    })();
  }, []);

  // Si no escribes total, lo calculamos como subtotal + itbms
  useEffect(() => {
    const s = Number(subtotal || 0);
    const t = Number(itbms || 0);
    setTotal(String((s + t).toFixed(2)));
  }, [subtotal, itbms]);

  const canSave = useMemo(() => {
    return fecha && sucursalId && Number(total) > 0;
  }, [fecha, sucursalId, total]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMsg(null);
      const payload = {
        fecha,
        sucursal_id: sucursalId || null,
        proveedor_id: proveedorId,
        proveedor: proveedorId ? null : (proveedorTxt || null),
        factura: factura || null,
        subtotal: Number(subtotal || 0),
        itbms: Number(itbms || 0),
        total: Number(total || 0),
        origen,
      };
      const { error } = await supabase.from('compras').insert(payload);
      if (error) throw error;
      setMsg('Compra guardada ✅');
      // Limpia rápido (deja sucursal/fecha)
      setFactura('');
      setSubtotal('0');
      setItbms('0');
      setTotal('0');
      setProveedorId(null);
      setProveedorTxt('');
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-bold">Captura de Compras</h1>
      {msg && <div className="text-sm">{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-slate-600">Fecha</label>
          <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} className="w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="text-xs text-slate-600">Sucursal</label>
          <select value={sucursalId} onChange={e=>setSucursalId(e.target.value)} className="w-full border rounded px-2 py-2">
            <option value="">— Selecciona —</option>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-600">Factura / Ref</label>
          <input value={factura} onChange={e=>setFactura(e.target.value)} className="w-full border rounded px-2 py-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-slate-600">Subtotal</label>
          <input type="number" step="0.01" value={subtotal} onChange={e=>setSubtotal(e.target.value)} className="w-full border rounded px-2 py-1 text-right" />
        </div>
        <div>
          <label className="text-xs text-slate-600">ITBMS</label>
          <input type="number" step="0.01" value={itbms} onChange={e=>setItbms(e.target.value)} className="w-full border rounded px-2 py-1 text-right" />
        </div>
        <div>
          <label className="text-xs text-slate-600">Total</label>
          <input type="number" step="0.01" value={total} onChange={e=>setTotal(e.target.value)} className="w-full border rounded px-2 py-1 text-right" />
        </div>
      </div>

      <ProveedorSelect
        value={proveedorId}
        onChange={setProveedorId}
        allowFreeText
        freeTextValue={proveedorTxt}
        onFreeTextChange={setProveedorTxt}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-slate-600">Origen</label>
          <select value={origen} onChange={e=>setOrigen(e.target.value)} className="w-full border rounded px-2 py-2">
            <option value="manual">manual</option>
            <option value="import">import</option>
            <option value="api">api</option>
          </select>
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-4 py-2 rounded bg-bean text-white disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar compra'}
        </button>
      </div>
    </div>
  );
}
