import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit3, Check, X, Search } from 'lucide-react';

type Proveedor = {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: any | null;
  activo: boolean;
  created_at: string;
};

export default function ProveedoresPage() {
  const [rows, setRows] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);

  // form state
  const [nombre, setNombre] = useState('');
  const [ruc, setRuc] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [activo, setActivo] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const resetForm = () => {
    setEditing(null);
    setNombre('');
    setRuc('');
    setTel('');
    setEmail('');
    setActivo(true);
    setMsg(null);
  };

  const openNew = () => { resetForm(); setShowForm(true); };
  const openEdit = (p: Proveedor) => {
    setEditing(p);
    setNombre(p.nombre || '');
    setRuc(p.ruc || '');
    setTel(p.contacto?.tel || '');
    setEmail(p.contacto?.email || '');
    setActivo(!!p.activo);
    setShowForm(true);
  };

  const fetchRows = async () => {
    setLoading(true);
    setMsg(null);
    const { data, error } = await supabase
      .from('proveedor')
      .select('*')
      .order('activo', { ascending: false })
      .order('nombre', { ascending: true })
      .limit(500);
    if (error) setMsg(error.message);
    setRows((data as Proveedor[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(p =>
      (p.nombre || '').toLowerCase().includes(t) ||
      (p.ruc || '').toLowerCase().includes(t) ||
      (p.contacto?.tel || '').toLowerCase().includes(t) ||
      (p.contacto?.email || '').toLowerCase().includes(t)
    );
  }, [rows, q]);

  const save = async () => {
    try {
      setMsg(null);
      const payload = {
        nombre: nombre.trim(),
        ruc: ruc.trim() || null,
        contacto: (tel || email) ? { tel: tel || null, email: email || null } : null,
        activo,
      };
      if (!payload.nombre) {
        setMsg('El nombre es obligatorio.');
        return;
      }
      if (editing) {
        const { error } = await supabase.from('proveedor').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('proveedor').insert(payload);
        if (error) throw error;
      }
      setShowForm(false);
      await fetchRows();
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
  };

  const toggleActivo = async (p: Proveedor) => {
    const { error } = await supabase.from('proveedor').update({ activo: !p.activo }).eq('id', p.id);
    if (!error) setRows(rows.map(r => r.id === p.id ? { ...r, activo: !p.activo } : r));
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Proveedores</h1>
        <button onClick={openNew} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bean text-white">
          <Plus className="h-4 w-4" /> Nuevo proveedor
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <input
            placeholder="Buscar por nombre, RUC, teléfono o email…"
            value={q}
            onChange={e=>setQ(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border rounded-lg"
          />
        </div>
        <button onClick={fetchRows} className="px-3 py-2 rounded-lg border">Refrescar</button>
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-off">
            <tr>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">RUC</th>
              <th className="p-2 text-left">Contacto</th>
              <th className="p-2 text-left">Activo</th>
              <th className="p-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4" colSpan={5}>Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="p-4 text-slate-500" colSpan={5}>Sin resultados</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.nombre}</td>
                <td className="p-2">{p.ruc || '—'}</td>
                <td className="p-2">
                  {p.contacto?.tel || p.contacto?.email
                    ? [p.contacto?.tel, p.contacto?.email].filter(Boolean).join(' · ')
                    : '—'}
                </td>
                <td className="p-2">
                  <span
                    onClick={() => toggleActivo(p)}
                    className={`inline-block px-2 py-0.5 rounded cursor-pointer text-xs ${p.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                    title="Click para activar/desactivar"
                  >
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="p-2 text-right">
                  <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 px-2 py-1 rounded border">
                    <Edit3 className="h-4 w-4" /> Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal simple */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4">
            <div className="text-lg font-semibold">{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</div>
            {msg && <div className="text-sm text-red-600">{msg}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600">Nombre *</label>
                <input value={nombre} onChange={e=>setNombre(e.target.value)} className="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="text-xs text-slate-600">RUC</label>
                <input value={ruc} onChange={e=>setRuc(e.target.value)} className="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Teléfono</label>
                <input value={tel} onChange={e=>setTel(e.target.value)} className="w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Email</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} className="w-full border rounded px-2 py-1" />
              </div>
              <label className="inline-flex items-center gap-2 mt-1">
                <input type="checkbox" checked={activo} onChange={e=>setActivo(e.target.checked)} />
                <span className="text-sm">Activo</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={()=>{ setShowForm(false); resetForm(); }} className="px-3 py-2 rounded border inline-flex items-center gap-1">
                <X className="h-4 w-4" /> Cancelar
              </button>
              <button onClick={save} className="px-3 py-2 rounded bg-bean text-white inline-flex items-center gap-1">
                <Check className="h-4 w-4" /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
