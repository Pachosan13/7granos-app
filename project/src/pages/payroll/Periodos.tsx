// ⬆️ Mantén tus imports. Solo agrega este nuevo tipo si quieres:
type Sucursal = { id: string; nombre: string };

// 🔽 Agrega estos estados debajo de tus otros useState:
const [sucursales, setSucursales] = useState<Sucursal[]>([]);
const [loadingSucursales, setLoadingSucursales] = useState(false);

// ⬇️ IMPORTANTE: necesitamos el setter del contexto
// en tu useAuthOrg hoy tienes { sucursalSeleccionada }.
// Asegúrate de extraer también el setter:
const { sucursalSeleccionada, setSucursalSeleccionada } = useAuthOrg() as {
  sucursalSeleccionada: { id: string; nombre: string } | null;
  setSucursalSeleccionada: (s: Sucursal | null) => void;
};

// 🔽 Carga sucursales al montar (solo si no hay una ya seleccionada)
useEffect(() => {
  let alive = true;
  (async () => {
    if (sucursalSeleccionada) return;
    setLoadingSucursales(true);
    const { data, error } = await supabase
      .from('sucursal')
      .select('id, nombre')
      .order('nombre', { ascending: true });
    if (!alive) return;
    if (error) {
      console.error('Error cargando sucursales:', error);
      setSucursales([]);
    } else {
      setSucursales(data || []);
    }
    setLoadingSucursales(false);
  })();
  return () => { alive = false; };
}, [sucursalSeleccionada]);

// 🔽 Helper para elegir sucursal
const pickSucursal = (id: string) => {
  const found = sucursales.find(s => s.id === id);
  if (found) {
    // persistimos para futuras sesiones
    localStorage.setItem('selectedSucursalId', found.id);
    setSucursalSeleccionada(found);
  }
};

// 🔽 (Opcional) fallback por querystring ?branch=
useEffect(() => {
  if (sucursalSeleccionada || sucursales.length === 0) return;
  const url = new URL(window.location.href);
  const qp = url.searchParams.get('branch'); // e.g. sf, museo, cangrejo
  if (qp) {
    const match = sucursales.find(
      s => s.id === qp || s.nombre.toLowerCase().includes(qp.toLowerCase())
    );
    if (match) {
      localStorage.setItem('selectedSucursalId', match.id);
      setSucursalSeleccionada(match);
    }
  } else {
    // (Opcional) recuperar última
    const saved = localStorage.getItem('selectedSucursalId');
    if (saved) {
      const found = sucursales.find(s => s.id === saved);
      if (found) setSucursalSeleccionada(found);
    }
  }
}, [sucursales, sucursalSeleccionada, setSucursalSeleccionada]);

// 🔽 Reemplaza tu early return del empty-state por ESTE bloque:
if (!sucursalSeleccionada) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md mx-auto">
        <div className="bg-accent/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="h-12 w-12 text-accent" />
        </div>
        <h3 className="text-2xl font-bold text-bean mb-3">Selecciona una sucursal</h3>
        <p className="text-slate7g text-lg leading-relaxed mb-5">
          Necesitas seleccionar una sucursal para gestionar períodos de planilla.
        </p>

        <select
          className="px-4 py-3 rounded-2xl border border-sand bg-white"
          disabled={loadingSucursales || sucursales.length === 0}
          defaultValue=""
          onChange={(e) => pickSucursal(e.target.value)}
        >
          <option value="" disabled>
            {loadingSucursales ? 'Cargando sucursales…' : 'Elige una sucursal'}
          </option>
          {sucursales.map(s => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>

        {/* (Opcional) accesos rápidos */}
        {sucursales.length > 0 && (
          <div className="mt-4 flex gap-2 justify-center flex-wrap">
            {sucursales.slice(0,3).map(s => (
              <button
                key={s.id}
                onClick={() => pickSucursal(s.id)}
                className="px-3 py-2 text-sm rounded-xl border border-sand hover:bg-off transition"
              >
                {s.nombre}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
