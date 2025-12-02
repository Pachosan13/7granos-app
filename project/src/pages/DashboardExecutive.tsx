import React, { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, RefreshCw, Store } from "lucide-react"

import { useAuthOrg } from "../context/AuthOrgContext"
import { formatCurrencyUSD } from "../lib/format"
import KpiCard from "../components/dashboard/KpiCard"

// 🔒 Flag: este dashboard es 100% MOCK (no llama Supabase)
const USE_MOCK_DASHBOARD = true

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// MOCK DATA
// -----------------------------------------------------------------------------
// Ajusta estos números para que reflejen un 7 Granos “típico”
function buildMockSummary(): SummaryKpi {
  const ventas_totales = 11375.04
  const transacciones = 320 // ej. 320 tickets en 14 días

  const costo_ventas = 4800
  const costo_alimentos = 3000
  const costo_bebidas = 900
  const costo_mano_obra = 2500
  const gastos_operativos = 1800

  const utilidad_operativa =
    ventas_totales -
    costo_ventas -
    gastos_operativos -
    costo_mano_obra

  const margen_bruto_pct =
    ventas_totales > 0 ? (ventas_totales - costo_ventas) / ventas_totales : 0

  const margen_operativo_pct =
    ventas_totales > 0 ? utilidad_operativa / ventas_totales : 0

  const food_cost_pct =
    ventas_totales > 0 ? costo_alimentos / ventas_totales : 0

  const beverage_cost_pct =
    ventas_totales > 0 ? costo_bebidas / ventas_totales : 0

  const labor_cost_pct =
    ventas_totales > 0 ? costo_mano_obra / ventas_totales : 0

  const ticket_promedio =
    transacciones > 0 ? ventas_totales / transacciones : 0

  return {
    ventas_totales,
    transacciones,
    costo_ventas,
    costo_alimentos,
    costo_bebidas,
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
}

function computeCashflow(summary: SummaryKpi | null): CashflowSnapshot {
  if (!summary) return { diasCaja: 0, puntoEquilibrio: 0 }

  const gastosFijos =
    summary.gastos_operativos + summary.costo_mano_obra
  const promedioDiario = gastosFijos / 30
  const cajaSimulada = 2 * gastosFijos // 2 meses de gastos, demo

  const diasCaja =
    promedioDiario > 0 ? Math.max(0, cajaSimulada / promedioDiario) : 0

  const puntoEquilibrio =
    summary.margen_bruto_pct > 0
      ? gastosFijos / summary.margen_bruto_pct
      : 0

  return { diasCaja, puntoEquilibrio }
}

// -----------------------------------------------------------------------------
// Componente principal (solo MOCK, sin Supabase)
// -----------------------------------------------------------------------------
export default function DashboardExecutive() {
  const {
    sucursales,
    sucursalSeleccionada,
    setSucursalSeleccionada,
    isAdmin,
  } = useAuthOrg()

  const [summary, setSummary] = useState<SummaryKpi | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(() => fourteenDayWindow())

  const selectedSucursalId = sucursalSeleccionada?.id ?? null

  const loadData = useCallback(async () => {
    setLoading(true)

    if (USE_MOCK_DASHBOARD) {
      const mockRange = fourteenDayWindow()
      setRange(mockRange)
      const mockSummary = buildMockSummary()
      setSummary(mockSummary)
      setLoading(false)
      return
    }

    // 🔒 Cuando tengamos RPC real, aquí conectamos Supabase.
    setSummary(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData, selectedSucursalId])

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
              KPIs financieros simulados (modo demo).
            </p>
            {USE_MOCK_DASHBOARD && (
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-amber-600">
                MOCK • Esta vista no está conectada aún a Supabase.
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
                Ventana demo de 14 días ({range.desde} → {range.hasta})
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
          ) : (
            summary && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {/* Ventas & costos base */}
                <KpiCard
                  title="Ventas Totales"
                  value={summary.ventas_totales}
                  tooltip="Ventas totales del período"
                />
                <KpiCard
                  title="Costo de Ventas"
                  value={summary.costo_ventas}
                  tooltip="Costo de bienes vendidos"
                />
                <KpiCard
                  title="Gastos Operativos"
                  value={summary.gastos_operativos}
                  tooltip="Renta, servicios, otros gastos fijos"
                />

                {/* Margen bruto / operativo */}
                <KpiCard
                  title="Margen Bruto %"
                  value={summary.margen_bruto_pct}
                  formatter={formatPercent}
                  tooltip="(Ventas – Costo de ventas) / Ventas"
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
                  tooltip="Resultado después de costos y gastos"
                />

                {/* Food / Beverage / Labor */}
                <KpiCard
                  title="Food Cost %"
                  value={summary.food_cost_pct}
                  formatter={formatPercent}
                  tooltip="Costo de alimentos / Ventas"
                />
                <KpiCard
                  title="Beverage Cost %"
                  value={summary.beverage_cost_pct}
                  formatter={formatPercent}
                  tooltip="Costo de bebidas / Ventas"
                />
                <KpiCard
                  title="Labor Cost %"
                  value={summary.labor_cost_pct}
                  formatter={formatPercent}
                  tooltip="Costo de mano de obra / Ventas"
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
            )
          )}
        </section>

        {/* Cashflow simple */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            Cashflow Simple (Mock)
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
