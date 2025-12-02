import React, { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, RefreshCw, Store } from "lucide-react"
import { createClient } from "@supabase/supabase-js"

import { formatCurrencyUSD } from "../lib/format"
import { useAuthOrg } from "../context/AuthOrgContext"
import KpiCard from "../components/dashboard/KpiCard"
import { shouldUseDemoMode } from "../lib/supabase"

// -----------------------------------------------------------------------------
// Supabase client (mismo estilo que VentasResumen)
// -----------------------------------------------------------------------------
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
)

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------
interface Summary7d {
  ventas_netas: number
  cogs: number
  gastos: number
  utilidad: number
  tx: number
  ticket_promedio: number
  margen_bruto_pct: number
  ventas_vs_semana_ant_pct: number | null
}

interface VentasResumenRow {
  fecha: string
  nombre: string
  total: number
  itbms: number
  num_transacciones: number
}

interface CashflowSnapshot {
  diasCaja: number
  puntoEquilibrio: number
}

// -----------------------------------------------------------------------------
// Utilidades de fecha y formato
// -----------------------------------------------------------------------------
function fmt(date: Date) {
  return date.toLocaleDateString("en-CA")
}

function sevenDayWindow(includeToday: boolean) {
  const now = new Date()
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (includeToday ? 0 : 1)
  )
  const start = new Date(end)
  start.setDate(end.getDate() - 6)
  return { desde: fmt(start), hasta: fmt(end) }
}

function addDays(iso: string, delta: number) {
  const base = new Date(`${iso}T00:00:00`)
  base.setDate(base.getDate() + delta)
  return fmt(base)
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
  if (!value) return "—"
  return `${(value * 100).toFixed(1)}%`
}

// -----------------------------------------------------------------------------
// Fetch de resumen, usando api_resumen_ventas / api_resumen_ventas_por_sucursal
// -----------------------------------------------------------------------------
async function fetchResumenVentas(
  desde: string,
  hasta: string,
  sucursalId: string | null
): Promise<Summary7d | null> {
  const fnName = sucursalId
    ? "api_resumen_ventas_por_sucursal"
    : "api_resumen_ventas"

  const params: Record<string, any> = {
    p_desde: desde,
    p_hasta: hasta,
  }
  if (sucursalId) params.p_sucursal_id = sucursalId

  const { data, error } = await supabase.rpc<VentasResumenRow>(fnName, params)

  if (error) {
    console.error("[dashboard] Error en", fnName, error)
    return null
  }

  const rows = (data ?? []) as VentasResumenRow[]
  if (!rows.length) {
    console.log("[dashboard] Resumen sin filas para rango", { desde, hasta })
    return null
  }

  const ventas_netas = rows.reduce(
    (acc, r) => acc + Number(r.total ?? 0),
    0
  )
  const tx = rows.reduce(
    (acc, r) => acc + Number(r.num_transacciones ?? 0),
    0
  )
  const ticket_promedio = tx > 0 ? ventas_netas / tx : 0

  return {
    ventas_netas,
    cogs: 0,
    gastos: 0,
    utilidad: ventas_netas, // hasta que conectemos COGS/Gastos reales
    tx,
    ticket_promedio,
    margen_bruto_pct: ventas_netas > 0 ? 1 : 0,
    ventas_vs_semana_ant_pct: null,
  }
}

function computeCashflow(summary: Summary7d | null): CashflowSnapshot {
  if (!summary) return { diasCaja: 0, puntoEquilibrio: 0 }
  return {
    diasCaja: summary.utilidad > 0 ? 10 : 0,
    puntoEquilibrio: 0,
  }
}

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

  const [summary, setSummary] = useState<Summary7d | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(() => sevenDayWindow(true))
  const [usedFallback14d, setUsedFallback14d] = useState(false)

  const selectedSucursalId = sucursalSeleccionada?.id ?? null

  const loadData = useCallback(async () => {
    if (shouldUseDemoMode) {
      setLoading(false)
      return
    }

    setLoading(true)
    setSummary(null)
    setUsedFallback14d(false)

    // 1) Intento con ventana de 7 días (como estaba antes)
    const primaryRange = sevenDayWindow(true)
    let effectiveRange = primaryRange

    console.log("[dashboard] Intentando resumen 7d:", primaryRange)

    let summary7d = await fetchResumenVentas(
      primaryRange.desde,
      primaryRange.hasta,
      selectedSucursalId
    )

    // 2) Si 7 días no tienen ventas, hacemos fallback a 14 días (como Ventas)
    if (!summary7d) {
      const altDesde = addDays(primaryRange.desde, -7) // 14 días hacia atrás
      const altRange = { desde: altDesde, hasta: primaryRange.hasta }
      console.log("[dashboard] Sin datos en 7d, probando 14d:", altRange)

      const summary14d = await fetchResumenVentas(
        altRange.desde,
        altRange.hasta,
        selectedSucursalId
      )

      if (summary14d) {
        summary7d = summary14d
        effectiveRange = altRange
        setUsedFallback14d(true)
      }
    }

    setSummary(summary7d)
    setRange(effectiveRange)
    setLoading(false)
  }, [selectedSucursalId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const sucursalesOptions = useMemo(() => sucursales ?? [], [sucursales])
  const rangeLabel = useMemo(
    () => formatRangeLabel(range.desde, range.hasta),
    [range.desde, range.hasta]
  )
  const cashflow = useMemo(() => computeCashflow(summary), [summary])

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
              Ventas y rentabilidad consolidadas.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {usedFallback14d
                ? "Mostrando últimos 14 días con datos."
                : "Ventana base de 7 días (si hay datos)."}
            </p>
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
                ({range.desde} → {range.hasta})
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

        {/* KPIs */}
        <section>
          {loading && !summary ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-32 animate-pulse rounded-2xl bg-slate-100"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                title="Ventas Netas"
                value={summary?.ventas_netas ?? 0}
                tooltip="Suma de total en api_resumen_ventas"
              />
              <KpiCard title="COGS" value={summary?.cogs ?? 0} />
              <KpiCard title="Gastos" value={summary?.gastos ?? 0} />
              <KpiCard title="Utilidad" value={summary?.utilidad ?? 0} />
              <KpiCard
                title="Ticket Promedio"
                value={summary?.ticket_promedio ?? 0}
                formatter={(v) => formatCurrencyUSD(v)}
              />
              <KpiCard
                title="Margen Bruto"
                value={summary?.margen_bruto_pct ?? 0}
                formatter={(v) => formatPercent(v)}
              />
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
              <dt>Días de caja</dt>
              <dd className="text-lg font-semibold text-[#4B2E05]">
                {cashflow.diasCaja.toFixed(1)} días
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Punto de equilibrio</dt>
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
