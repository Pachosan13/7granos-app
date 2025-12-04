import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { CalendarDays, RefreshCw } from "lucide-react"
import { createClient } from "@supabase/supabase-js"

import { useAuthOrg } from "../context/AuthOrgContext"
import { formatCurrencyUSD } from "../lib/format"
import KpiCard from "../components/dashboard/KpiCard"

// 👉 Client local, mismo patrón que en otros archivos del proyecto
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
)

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------
interface DashboardExecRow {
  ventas_14d: number | string | null
  cogs_14d: number | string | null
  margen_bruto_14d: number | string | null
  margen_bruto_pct_14d: number | string | null
  transacciones_14d: number | string | null
  ticket_promedio_14d: number | string | null
}

interface GastosMesRow {
  mes: string
  sucursal_id: string | null
  gastos: number | string | null
}

interface LaborCostRow {
  mes: string
  sucursal_id: string | null
  labor_cost_mensual: number | string | null
}

interface SummaryKpi {
  ventas_totales: number
  transacciones: number
  costo_ventas: number
  costo_alimentos: number
  costo_bebidas: number
  costo_mano_obra: number
  gastos_operativos: number
  utilidad_operativa: number

  margen_bruto_pct: number
  margen_operativo_pct: number
  food_cost_pct: number
  beverage_cost_pct: number
  labor_cost_pct: number
  ticket_promedio: number
}

interface DailyReconRow {
  fecha: string
  branch: string
  ventas_totales: number
  num_transacciones: number
  cogs_totales: number
  margen_bruto_pct: number
  ticket_promedio: number
}

// -----------------------------------------------------------------------------
// Utilidades de fecha / formato
// -----------------------------------------------------------------------------
function fmt(date: Date) {
  // YYYY-MM-DD para que machee con columnas date
  return date.toLocaleDateString("en-CA")
}

function fourteenDayWindow(): { desde: string; hasta: string } {
  const now = new Date()
  const hasta = fmt(now)
  const start = new Date(now)
  start.setDate(start.getDate() - 13)
  const desde = fmt(start)
  return { desde, hasta }
}

function formatRangeLabel(desde: string, hasta: string) {
  try {
    const s = new Date(desde)
    const e = new Date(hasta)
    const sameMonth = s.getMonth() === e.getMonth()
    const opts: Intl.DateTimeFormatOptions = sameMonth
      ? { day: "2-digit" }
      : { day: "2-digit", month: "short" }

    const startLabel = s.toLocaleDateString("es-PA", opts)
    const endLabel = e.toLocaleDateString("es-PA", {
      day: "2-digit",
      month: "short",
    })
    return `${startLabel} – ${endLabel}`
  } catch {
    return `${desde} – ${hasta}`
  }
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—"
  return `${(value * 100).toFixed(1)}%`
}

// Para evitar NaN: siempre casteamos a número
const asNumber = (v: number | string | null | undefined): number =>
  v == null ? 0 : Number(v)

// -----------------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------------
export default function DashboardExecutive() {
  const {
    sucursales,
    sucursalSeleccionada,
    setSucursalSeleccionada,
    isAdmin,
  } = useAuthOrg()

  const [summary, setSummary] = useState<SummaryKpi | null>(null)
  const [dailyRows, setDailyRows] = useState<DailyReconRow[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<{ desde: string; hasta: string }>(
    () => fourteenDayWindow()
  )
  const [loadError, setLoadError] = useState<string | null>(null)

  const selectedSucursalId = sucursalSeleccionada?.id ?? null
  const sucursalesOptions = useMemo(() => sucursales ?? [], [sucursales])
  const rangeLabel = useMemo(
    () => formatRangeLabel(range.desde, range.hasta),
    [range.desde, range.hasta]
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    // Definimos la ventana de 14 días (misma que usamos en conciliación)
    const { desde, hasta } = fourteenDayWindow()
    setRange({ desde, hasta })

    // 1) KPIs de 14 días: api_dashboard_exec (UNA fila, sucursal-aware)
    const { data, error } = await supabase
      .rpc("api_dashboard_exec", {
        p_desde: desde,
        p_hasta: hasta,
        p_sucursal_id: selectedSucursalId ?? null,
      })
      .single()

    if (error) {
      console.error("Error cargando api_dashboard_exec:", error)
      setLoadError("No se pudo cargar la data de ventas / COGS.")
      setSummary(null)
      setDailyRows([])
      setLoading(false)
      return
    }

    if (!data) {
      setLoadError("No hay datos para el período.")
      setSummary(null)
      setDailyRows([])
      setLoading(false)
      return
    }

    const kpi = data as DashboardExecRow

    const ventas_totales = asNumber(kpi.ventas_14d)
    const costo_ventas = asNumber(kpi.cogs_14d)
    const transacciones = asNumber(kpi.transacciones_14d)
    const ticket_promedio_db = asNumber(kpi.ticket_promedio_14d)

    const ticket_promedio =
      transacciones > 0
        ? ventas_totales / transacciones
        : ticket_promedio_db

    // 2) Gastos fijos + planilla (mes) desde v_gastos_mensual_sucursal_merged
    const hastaDate = new Date(hasta)
    const mesInicio = new Date(
      hastaDate.getFullYear(),
      hastaDate.getMonth(),
      1
    )
    const mesClave = fmt(mesInicio)

    let gastosQuery = supabase
      .from("v_gastos_mensual_sucursal_merged")
      .select("mes, sucursal_id, gastos")
      .eq("mes", mesClave)

    if (selectedSucursalId) {
      gastosQuery = gastosQuery.eq("sucursal_id", selectedSucursalId)
    }

    const { data: gastosData, error: gastosError } = await gastosQuery

    if (gastosError) {
      console.error("Error gastos:", gastosError)
    }

    const gastosRows = (gastosData as GastosMesRow[] | null) ?? []
    const gastos_operativos = gastosRows.reduce(
      (acc, r) => acc + asNumber(r.gastos),
      0
    )

    // 3) Labor cost mensual desde v_labor_cost_mensual
    let laborQuery = supabase
      .from("v_labor_cost_mensual")
      .select("mes, sucursal_id, labor_cost_mensual")
      .eq("mes", mesClave)

    if (selectedSucursalId) {
      laborQuery = laborQuery.eq("sucursal_id", selectedSucursalId)
    }

    const { data: laborData, error: laborError } = await laborQuery

    if (laborError) {
      console.error("Error labor cost:", laborError)
    }

    const laborRows = (laborData as LaborCostRow[] | null) ?? []
    const costo_mano_obra = laborRows.reduce(
      (acc, r) => acc + asNumber(r.labor_cost_mensual),
      0
    )

    const utilidad_operativa =
      ventas_totales - costo_ventas - costo_mano_obra - gastos_operativos

    const margen_bruto_pct =
      ventas_totales > 0
        ? (ventas_totales - costo_ventas) / ventas_totales
        : 0

    const margen_operativo_pct =
      ventas_totales > 0 ? utilidad_operativa / ventas_totales : 0

    const food_cost_pct =
      ventas_totales > 0 ? costo_ventas / ventas_totales : 0
    const beverage_cost_pct = 0
    const labor_cost_pct =
      ventas_totales > 0 ? costo_mano_obra / ventas_totales : 0

    const summaryKpi: SummaryKpi = {
      ventas_totales,
      transacciones,
      costo_ventas,
      costo_alimentos: costo_ventas, // TODO: split real por categoría
      costo_bebidas: 0,
      costo_mano_obra,
      gastos_operativos,
      utilidad_operativa,
      margen_bruto_pct,
      margen_operativo_pct,
      food_cost_pct,
      beverage_cost_pct,
      labor_cost_pct,
      ticket_promedio,
    }

    setSummary(summaryKpi)

    // 4) Conciliación diaria desde public.pruebas
    let dailyQuery = supabase
      .from("pruebas")
      .select(
        "fecha, sucursal_id, branch, ventas_totales, num_transacciones, cogs_totales, margen_bruto_pct, ticket_promedio"
      )
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("branch", { ascending: true })

    if (selectedSucursalId) {
      dailyQuery = dailyQuery.eq("sucursal_id", selectedSucursalId)
    }

    const { data: dailyData, error: dailyError } = await dailyQuery

    if (dailyError) {
      console.error("Error conciliación diaria (pruebas):", dailyError)
      setDailyRows([])
      setLoading(false)
      return
    }

    const mappedDaily: DailyReconRow[] =
      (dailyData ?? []).map((r: any) => ({
        fecha: r.fecha,
        branch: r.branch ?? "—",
        ventas_totales: asNumber(r.ventas_totales),
        num_transacciones: asNumber(r.num_transacciones),
        cogs_totales: asNumber(r.cogs_totales),
        margen_bruto_pct: asNumber(r.margen_bruto_pct),
        ticket_promedio: asNumber(r.ticket_promedio),
      })) ?? []

    setDailyRows(mappedDaily)
    setLoading(false)
  }, [selectedSucursalId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const cashflow = useMemo(() => {
    if (!summary) return { diasCaja: 0, puntoEquilibrio: 0 }

    const gastosFijos = summary.gastos_operativos + summary.costo_mano_obra
    const promedioDiario = gastosFijos / 30
    const cajaSimulada = 2 * gastosFijos // 2 meses, demo

    const diasCaja =
      promedioDiario > 0 ? Math.max(0, cajaSimulada / promedioDiario) : 0

    const puntoEquilibrio =
      summary.margen_bruto_pct > 0
        ? gastosFijos / summary.margen_bruto_pct
        : 0

    return { diasCaja, puntoEquilibrio }
  }, [summary])

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-8">
      <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">
              Dashboard Ejecutivo
            </h1>
            <p className="text-sm text-slate-500">
              KPIs financieros conectados a INVU + gastos mensuales.
            </p>
            {loadError && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {loadError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-[#4B2E05] px-5 py-2 text-sm font-semibold text-white shadow hover:bg-[#3a2303] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Actualizar
            </button>
          </div>
        </header>

        {/* Filtros arriba */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                <CalendarDays className="h-4 w-4" /> {rangeLabel}
              </span>
              <span className="inline-flex items-center gap-2 text-slate-500">
                Ventana de 14 días ({range.desde} → {range.hasta})
              </span>
            </div>
            {isAdmin ? (
              <label className="flex flex-col text-sm text-slate-600">
                <span className="mb-1 font-medium text-slate-500">
                  Sucursal
                </span>
                <select
                  value={selectedSucursalId ?? ""}
                  onChange={(event) => {
                    const value = event.target.value || null
                    const branch =
                      sucursalesOptions.find((s) => s.id === value) ?? null
                    setSucursalSeleccionada(branch ?? null)
                  }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-[#4B2E05] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                >
                  <option value="">Todas las sucursales</option>
                  {sucursalesOptions.map((sucursal) => (
                    <option key={sucursal.id} value={sucursal.id}>
                      {sucursal.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </section>

        {/* KPIs financieros */}
        <section>
          {loading && !summary ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, index) => (
                <div
                  key={index}
                  className="h-32 animate-pulse rounded-2xl bg-slate-100"
                />
              ))}
            </div>
          ) : summary ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {/* Ventas & costos base */}
              <KpiCard
                title="Ventas Totales (14 días)"
                value={summary.ventas_totales}
                formatter={formatCurrencyUSD}
                tooltip="Ventas totales del período seleccionado"
              />
              <KpiCard
                title="Costo de Ventas (COGS)"
                value={summary.costo_ventas}
                formatter={formatCurrencyUSD}
                tooltip="Costo total de bienes vendidos en el período"
              />
              <KpiCard
                title="Gastos Operativos (mes)"
                value={summary.gastos_operativos}
                formatter={formatCurrencyUSD}
                tooltip="Gasto fijo + planilla del mes (vista v_gastos_mensual_sucursal_merged)"
              />

              {/* Margen bruto / operativo */}
              <KpiCard
                title="Margen Bruto %"
                value={summary.margen_bruto_pct}
                formatter={formatPercent}
                tooltip="(Ventas – COGS) / Ventas"
              />
              <KpiCard
                title="Margen Operativo %"
                value={summary.margen_operativo_pct}
                formatter={formatPercent}
                tooltip="Utilidad operativa / Ventas"
              />
              <KpiCard
                title="Utilidad Operativa"
                value={summary.utilidad_operativa}
                formatter={formatCurrencyUSD}
                tooltip="Ventas – COGS – mano de obra – gastos operativos"
              />

              {/* Food / Beverage / Labor */}
              <KpiCard
                title="Food Cost % (total COGS)"
                value={summary.food_cost_pct}
                formatter={formatPercent}
                tooltip="Por ahora todo el COGS cae en Food hasta que tengamos split por categoría."
              />
              <KpiCard
                title="Beverage Cost %"
                value={summary.beverage_cost_pct}
                formatter={formatPercent}
                tooltip="Placeholder, quedará en 0 hasta que tengamos split real."
              />
              <KpiCard
                title="Labor Cost %"
                value={summary.labor_cost_pct}
                formatter={formatPercent}
                tooltip="Costo de mano de obra / Ventas del período."
              />

              {/* Ticket & transacciones */}
              <KpiCard
                title="Ticket Promedio"
                value={summary.ticket_promedio}
                formatter={formatCurrencyUSD}
                tooltip="Ventas totales / Número de transacciones"
              />
              <KpiCard
                title="Transacciones"
                value={summary.transacciones}
                tooltip="Número de tickets en el período"
              />
            </div>
          ) : null}
        </section>

        {/* Conciliación diaria Ventas vs COGS */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Conciliación diaria: Ventas vs COGS
            </h2>
            <p className="text-xs text-slate-500">
              Fuente: view <code>public.pruebas</code>
            </p>
          </div>

          {dailyRows.length === 0 ? (
            <p className="text-sm text-slate-500">
              No hay datos para mostrar en el rango seleccionado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2 text-right">Ventas</th>
                    <th className="px-3 py-2 text-right">Transacciones</th>
                    <th className="px-3 py-2 text-right">COGS</th>
                    <th className="px-3 py-2 text-right">Margen Bruto %</th>
                    <th className="px-3 py-2 text-right">Ticket Prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((row, idx) => (
                    <tr
                      key={`${row.fecha}-${row.branch}-${idx}`}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {new Date(row.fecha).toLocaleDateString("es-PA", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </td>
                      <td className="px-3 py-2 text-sm font-medium">
                        {row.branch}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrencyUSD(row.ventas_totales)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.num_transacciones}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrencyUSD(row.cogs_totales)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatPercent(row.margen_bruto_pct)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrencyUSD(row.ticket_promedio)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Cashflow simple */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            Cashflow Simple
          </h2>
          <dl className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <dt>Días de caja simulados</dt>
              <dd className="text-lg font-semibold text-[#4B2E05]">
                {cashflow.diasCaja.toFixed(1)} días
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Punto de equilibrio estimado</dt>
              <dd className="text-lg font-semibold text-[#D4AF37]">
                {formatCurrencyUSD(cashflow.puntoEquilibrio)}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  )
}
