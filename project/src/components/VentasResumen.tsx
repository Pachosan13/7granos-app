import { useMemo } from 'react'
import { useResumenVentas } from '../hooks/useResumenVentas'

type Row = {
  fecha: string
  nombre: string
  total: number
  itbms: number
  num_transacciones: number
}

export default function VentasResumen({ desde, hasta }: { desde: string; hasta: string }) {
  const { data, loading, error } = useResumenVentas({ desde, hasta })
  const rows = useMemo(() => (data?.rows as Row[] | undefined) ?? [], [data?.rows])

  if (loading) return <div>Cargando…</div>
  if (error) return <div className="text-red-600">Error: {error}</div>

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-3">Resumen de ventas</h2>
      <table className="min-w-full border">
        <thead>
          <tr>
            <th className="border px-2 py-1 text-left">Fecha</th>
            <th className="border px-2 py-1 text-left">Sucursal</th>
            <th className="border px-2 py-1 text-right">Total</th>
            <th className="border px-2 py-1 text-right">ITBMS</th>
            <th className="border px-2 py-1 text-right"># Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="border px-2 py-1">{r.fecha}</td>
              <td className="border px-2 py-1">{r.nombre}</td>
              <td className="border px-2 py-1 text-right">{Number(r.total).toFixed(2)}</td>
              <td className="border px-2 py-1 text-right">{Number(r.itbms).toFixed(2)}</td>
              <td className="border px-2 py-1 text-right">{r.num_transacciones}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="border px-2 py-4 text-center text-slate-500">
                No hay datos en el rango seleccionado
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
