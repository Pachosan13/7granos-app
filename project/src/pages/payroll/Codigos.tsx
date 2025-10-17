import { useState, useEffect } from 'react';
import { Code, AlertCircle, Tag } from 'lucide-react';
import { useAuthOrg } from '../../context/AuthOrgContext';
import { supabase } from '../../lib/supabase';

interface Codigo {
  code: string;
  descripcion: string;
  tipo: 'earning' | 'deduction' | 'tax' | 'employer_contrib';
}

const TIPOS_LABELS = {
  earning: 'Ingreso',
  deduction: 'Deducción',
  tax: 'Impuesto',
  employer_contrib: 'Aporte Patronal'
};

const TIPOS_COLORS = {
  earning: 'bg-green-100 text-green-800 border-green-200',
  deduction: 'bg-red-100 text-red-800 border-red-200',
  tax: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  employer_contrib: 'bg-blue-100 text-blue-800 border-blue-200'
};

const TIPOS_ICONS = {
  earning: '💰',
  deduction: '➖',
  tax: '🏛️',
  employer_contrib: '🏢'
};

export const Codigos = () => {
  const { sucursalSeleccionada } = useAuthOrg();
  const [codigos, setCodigos] = useState<Codigo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');

  useEffect(() => {
    loadCodigos();
  }, []);

  const loadCodigos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('hr_codigo')
        .select('*')
        .order('tipo')
        .order('code');

      if (error) throw error;
      setCodigos(data || []);
    } catch (error) {
      console.error('Error cargando códigos:', error);
      setError('Error cargando códigos');
    } finally {
      setLoading(false);
    }
  };

  const codigosFiltrados = filtroTipo === 'todos' 
    ? codigos 
    : codigos.filter(c => c.tipo === filtroTipo);

  const codigosPorTipo = codigos.reduce((acc, codigo) => {
    acc[codigo.tipo] = (acc[codigo.tipo] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (!sucursalSeleccionada) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-md mx-auto">
            <div className="bg-accent/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="h-12 w-12 text-accent" />
            </div>
            <h3 className="text-2xl font-bold text-bean mb-3">Selecciona una sucursal</h3>
            <p className="text-slate7g text-lg leading-relaxed">
              Necesitas seleccionar una sucursal para ver los códigos de planilla.
            </p>
          </div>
        </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-bean mb-4 tracking-tight">
            Catálogo de Códigos
          </h1>
          <p className="text-xl text-slate7g leading-relaxed">
            Códigos disponibles para entradas de planilla (solo lectura)
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border-l-4 border-red-400 rounded-xl">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-sand">
            <div className="flex items-center justify-between mb-2">
              <Tag className="h-8 w-8 text-accent" />
              <div className="text-3xl font-bold text-bean">{codigos.length}</div>
            </div>
            <p className="text-slate7g font-medium">Total códigos</p>
          </div>

          {Object.entries(TIPOS_LABELS).map(([tipo, label]) => (
            <div key={tipo} className="bg-white p-6 rounded-2xl shadow-lg border border-sand">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{TIPOS_ICONS[tipo as keyof typeof TIPOS_ICONS]}</span>
                <div className="text-3xl font-bold text-bean">
                  {codigosPorTipo[tipo] || 0}
                </div>
              </div>
              <p className="text-slate7g font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <h3 className="text-lg font-bold text-bean mb-4">Filtrar por tipo:</h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFiltroTipo('todos')}
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                filtroTipo === 'todos'
                  ? 'bg-accent text-white'
                  : 'bg-off text-slate7g hover:bg-accent/10 hover:text-accent'
              }`}
            >
              Todos ({codigos.length})
            </button>
            {Object.entries(TIPOS_LABELS).map(([tipo, label]) => (
              <button
                key={tipo}
                onClick={() => setFiltroTipo(tipo)}
                className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                  filtroTipo === tipo
                    ? 'bg-accent text-white'
                    : 'bg-off text-slate7g hover:bg-accent/10 hover:text-accent'
                }`}
              >
                {TIPOS_ICONS[tipo as keyof typeof TIPOS_ICONS]} {label} ({codigosPorTipo[tipo] || 0})
              </button>
            ))}
          </div>
        </div>

        {/* Lista de códigos */}
        {loading ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"></div>
            <p className="text-slate7g">Cargando códigos...</p>
          </div>
        ) : codigosFiltrados.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <Code className="h-16 w-16 text-slate7g mx-auto mb-6" />
            <h3 className="text-xl font-bold text-bean mb-3">No hay códigos</h3>
            <p className="text-slate7g">
              {filtroTipo === 'todos' 
                ? 'No se encontraron códigos en el sistema.'
                : `No hay códigos del tipo "${TIPOS_LABELS[filtroTipo as keyof typeof TIPOS_LABELS]}".`
              }
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate7g text-white">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Código</th>
                    <th className="px-6 py-4 text-left font-semibold">Descripción</th>
                    <th className="px-6 py-4 text-left font-semibold">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {codigosFiltrados.map((codigo, index) => (
                    <tr 
                      key={codigo.code}
                      className={`transition-colors duration-150 hover:bg-accent/5 ${
                        index % 2 === 0 ? 'bg-white' : 'bg-off/30'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-mono font-bold text-bean bg-off px-3 py-1 rounded-lg inline-block">
                          {codigo.code}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-bean">
                          {codigo.descripcion}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${TIPOS_COLORS[codigo.tipo]}`}>
                          {TIPOS_ICONS[codigo.tipo]} {TIPOS_LABELS[codigo.tipo]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
  );
};