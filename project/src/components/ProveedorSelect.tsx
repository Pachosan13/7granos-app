import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Option = { id: string; nombre: string; activo: boolean };

export function ProveedorSelect({
  value,
  onChange,
  allowFreeText = true,
  freeTextValue,
  onFreeTextChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  allowFreeText?: boolean;
  freeTextValue?: string;
  onFreeTextChange?: (v: string) => void;
}) {
  const [opts, setOpts] = useState<Option[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('proveedor')
        .select('id,nombre,activo')
        .order('activo', { ascending: false })
        .order('nombre', { ascending: true })
        .limit(500);
      setOpts((data as any[])?.map(d => ({ id: d.id, nombre: d.nombre, activo: d.activo })) ?? []);
    })();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return opts;
    return opts.filter(o => o.nombre.toLowerCase().includes(t));
  }, [opts, q]);

  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-600">Proveedor</label>
      <input
        placeholder="Buscar…"
        value={q}
        onChange={e=>setQ(e.target.value)}
        className="w-full border rounded px-2 py-1 mb-1"
      />
      <select
        className="w-full border rounded px-2 py-2"
        value={value ?? ''}
        onChange={e=>onChange(e.target.value || null)}
      >
        <option value="">— Selecciona proveedor —</option>
        {filtered.map(o => (
          <option key={o.id} value={o.id}>
            {o.nombre}{o.activo ? '' : ' (inactivo)'}
          </option>
        ))}
      </select>

      {allowFreeText && (
        <div className="mt-2">
          <label className="text-xs text-slate-600">Proveedor (texto libre)</label>
          <input
            value={freeTextValue ?? ''}
            onChange={(e)=>onFreeTextChange?.(e.target.value)}
            placeholder="Si aún no existe en el catálogo"
            className="w-full border rounded px-2 py-1"
          />
        </div>
      )}
    </div>
  );
}
