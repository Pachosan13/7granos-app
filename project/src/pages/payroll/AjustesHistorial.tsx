import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
  } from "react"
  import {
    AlertCircle,
    ArrowDownRight,
    ArrowUpRight,
    Building2,
    DollarSign,
    Filter,
    Loader2,
    RefreshCw,
  } from "lucide-react"
  import * as AuthOrgMod from "../../context/AuthOrgContext"
  import { supabase } from "../../lib/supabase"
  
  type Sucursal = { id: string; nombre: string }
  
  type UseAuthOrgResult = {
    sucursales: Sucursal[]
    sucursalSeleccionada: Sucursal | null
    setSucursalSeleccionada: (sucursal: Sucursal | null) => void
  }
  
  type AuthOrgModule = {
    useAuthOrg?: () => UseAuthOrgResult
    default?: () => UseAuthOrgResult
  }
  
  const authOrgModule = AuthOrgMod as unknown as AuthOrgModule
  
  const useAuthOrg =
    authOrgModule.useAuthOrg ??
    authOrgModule.default ??
    (() => ({
      sucursales: [] as Sucursal[],
      sucursalSeleccionada: null as Sucursal | null,
      setSucursalSeleccionada: (sucursal: Sucursal | null) => {
        void sucursal
      },
    }))
  
  type AjusteRow = {
    id: string
    periodo: string
    empleado_id: string
    empleado: string | null
    sucursal_id: string
    sucursal: string | null
    tipo: string
    monto: number
    monto_signed: number
    created_at: string
  }
  
  type FiltersState = {
    year: string
    month: string
    searchEmpleado: string
    searchSucursal: string
  }
  
  const DEFAULT_FILTERS: FiltersState = {
    year: "",
    month: "",
    searchEmpleado: "",
    searchSucursal: "",
  }
  
  const formatCurrency = (value: number | null | undefined) => {
    const numeric = Number(value ?? 0)
    const safeValue = Number.isFinite(numeric) ? numeric : 0
    return new Intl.NumberFormat("es-PA", {
      style: "currency",
      currency: "USD",
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue)
  }
  
  export default function AjustesHistorial() {
    const { sucursales, sucursalSeleccionada, setSucursalSeleccionada } =
      useAuthOrg()
  
    const [rows, setRows] = useState<AjusteRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filters, setFilters] = useState<FiltersState>(() => {
      if (typeof window === "undefined") return DEFAULT_FILTERS
      try {
        const stored = window.localStorage.getItem(
          "payroll_ajustes_historial_filters"
        )
        if (!stored) return DEFAULT_FILTERS
        return { ...DEFAULT_FILTERS, ...JSON.parse(stored) } as FiltersState
      } catch {
        return DEFAULT_FILTERS
      }
    })
  
    const selectedSucursal = sucursalSeleccionada ?? null
    const currentSucursalId = selectedSucursal?.id ?? null
  
    useEffect(() => {
      if (typeof window === "undefined") return
      window.localStorage.setItem(
        "payroll_ajustes_historial_filters",
        JSON.stringify(filters)
      )
    }, [filters])
  
    useEffect(() => {
      if (typeof window === "undefined") return
      if (!sucursalSeleccionada && sucursales.length > 0) {
        const storedId = window.localStorage.getItem("selectedSucursalId")
        const fallback = storedId
          ? sucursales.find((s) => String(s.id) === String(storedId))
          : sucursales[0]
        if (fallback) {
          setSucursalSeleccionada(fallback)
        }
      }
    }, [sucursalSeleccionada, sucursales, setSucursalSeleccionada])
  
    const fetchRows = useCallback(async () => {
      if (!currentSucursalId) {
        setRows([])
        setError(null)
        setLoading(false)
        return
      }
  
      setLoading(true)
      setError(null)
  
      try {
        const { data, error: qError } = await supabase
          .from("v_payroll_ajustes_historial")
          .select("*")
          .eq("sucursal_id", currentSucursalId)
          .order("periodo", { ascending: false })
          .order("created_at", { ascending: false })
  
        if (qError) throw qError
  
        setRows((data ?? []) as AjusteRow[])
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[AjustesHistorial] Error cargando ajustes", msg)
        setRows([])
        setError("No se pudo cargar el historial de ajustes.")
      } finally {
        setLoading(false)
      }
    }, [currentSucursalId])
  
    useEffect(() => {
      void fetchRows()
    }, [fetchRows])
  
    const handleSucursalChange: React.ChangeEventHandler<HTMLSelectElement> =
      useCallback(
        (event) => {
          const nextId = event.target.value
          const nextSucursal =
            sucursales.find((s) => String(s.id) === String(nextId)) ?? null
          setSucursalSeleccionada(nextSucursal)
          if (typeof window !== "undefined") {
            if (nextId) {
              window.localStorage.setItem("selectedSucursalId", nextId)
            } else {
              window.localStorage.removeItem("selectedSucursalId")
            }
          }
        },
        [setSucursalSeleccionada, sucursales]
      )
  
    const filteredRows = useMemo(() => {
      return rows.filter((row) => {
        // Año
        if (filters.year && !row.periodo.startsWith(filters.year)) return false
  
        // Mes
        if (filters.month) {
          const month = row.periodo.slice(5, 7)
          if (month !== filters.month.padStart(2, "0")) return false
        }
  
        // Colaborador
        if (filters.searchEmpleado) {
          const emp = (row.empleado ?? "").toLowerCase()
          if (!emp.includes(filters.searchEmpleado.toLowerCase())) return false
        }
  
        // Sucursal
        if (filters.searchSucursal) {
          const suc = (row.sucursal ?? "").toLowerCase()
          if (!suc.includes(filters.searchSucursal.toLowerCase())) return false
        }
  
        return true
      })
    }, [rows, filters])
  
    const totals = useMemo(() => {
      return filteredRows.reduce(
        (acc, row) => {
          const signed = Number(row.monto_signed ?? row.monto ?? 0)
          if (row.tipo === "bono") {
            acc.bonos += signed
          } else if (row.tipo === "adelanto" || row.tipo === "descuento") {
            acc.descuentos += signed
          }
          acc.neto += signed
          return acc
        },
        {
          bonos: 0,
          descuentos: 0,
          neto: 0,
        }
      )
    }, [filteredRows])
  
    const showEmptyState =
      !loading && !error && !!currentSucursalId && filteredRows.length === 0
  
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur-sm md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Historial de ajustes
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Ajustes aplicados a la planilla
              </h1>
              <p className="text-sm text-slate-600">
                Adelantos, descuentos y bonos aplicados a la planilla.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {sucursales.length > 0 ? (
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-inner">
                <Building2 className="h-4 w-4 text-slate-500" />
                <select
                  value={currentSucursalId ?? ""}
                  onChange={handleSucursalChange}
                  className="bg-transparent text-sm focus:outline-none"
                >
                  <option value="" disabled>
                    Selecciona sucursal
                  </option>
                  {sucursales.map((sucursal) => (
                    <option key={String(sucursal.id)} value={String(sucursal.id)}>
                      {sucursal.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="text-sm text-slate-500">
                Sin sucursales disponibles
              </span>
            )}

            <button
              type="button"
              onClick={() => void fetchRows()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refrescar
            </button>
          </div>
        </div>
  
        {/* FILTROS */}
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter className="h-4 w-4" />
            Filtros
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Año
              <input
                type="number"
                inputMode="numeric"
                min={2000}
                max={2100}
                value={filters.year}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, year: e.target.value }))
                }
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="2025"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Mes
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                value={filters.month}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, month: e.target.value }))
                }
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="01"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Buscar colaborador
              <input
                type="search"
                value={filters.searchEmpleado}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    searchEmpleado: e.target.value,
                  }))
                }
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="Nombre del colaborador"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Buscar sucursal
              <input
                type="search"
                value={filters.searchSucursal}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    searchSucursal: e.target.value,
                  }))
                }
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="Nombre de la sucursal"
              />
            </label>
          </div>
        </section>
  
        {/* ESTADOS */}
        {!currentSucursalId ? (
          <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-600 shadow-sm">
            Selecciona una sucursal para ver el historial de ajustes.
          </div>
        ) : loading ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-slate-500" />
            <p className="text-sm text-slate-600">Cargando historial…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border-l-4 border-red-500 bg-red-50 p-6 text-red-700">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              <p className="font-medium">{error}</p>
            </div>
          </div>
        ) : showEmptyState ? (
          <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-600 shadow-sm">
            No hay ajustes registrados con los filtros actuales.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {/* TABLA */}
            <div className="rounded-2xl border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Ajustes aplicados
                </h2>
                <span className="text-xs text-slate-500">
                  {filteredRows.length} registros
                </span>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50/90 text-left text-xs uppercase tracking-wide text-slate-500 backdrop-blur">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Periodo</th>
                      <th className="px-4 py-3 font-semibold">Empleado</th>
                      <th className="px-4 py-3 font-semibold">Sucursal</th>
                      <th className="px-4 py-3 font-semibold text-center">Tipo</th>
                      <th className="px-4 py-3 font-semibold text-right">Monto</th>
                      <th className="px-5 py-3 font-semibold text-right">
                        Registrado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {filteredRows.map((row) => {
                      const isBono = row.tipo === "bono"
                      const isDescuento =
                        row.tipo === "adelanto" || row.tipo === "descuento"
  
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/60">
                          <td className="px-5 py-3 align-middle text-xs text-slate-500">
                            {row.periodo}
                          </td>
                          <td className="px-4 py-3 align-middle font-medium text-slate-900">
                            {row.empleado ?? "—"}
                          </td>
                          <td className="px-4 py-3 align-middle text-xs text-slate-600">
                            {row.sucursal ?? "—"}
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                isBono
                                  ? "bg-emerald-50 text-emerald-700"
                                  : isDescuento
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {isBono ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : isDescuento ? (
                                <ArrowDownRight className="h-3 w-3" />
                              ) : (
                                <DollarSign className="h-3 w-3" />
                              )}
                              {row.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-right font-semibold text-slate-900">
                            {formatCurrency(row.monto_signed ?? row.monto)}
                          </td>
                          <td className="px-5 py-3 align-middle text-right text-xs text-slate-500">
                            {new Date(row.created_at).toLocaleString("es-PA", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
  
            {/* RESUMEN */}
            <div className="flex flex-col gap-4 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Resumen de impacto
              </h2>
              <div className="grid gap-4 md:grid-cols-1">
                <div className="rounded-xl bg-emerald-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-emerald-600">
                    Bonos (positivo)
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-700">
                    {formatCurrency(totals.bonos)}
                  </p>
                </div>
                <div className="rounded-xl bg-rose-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-rose-600">
                    Adelantos / descuentos (negativo)
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-rose-700">
                    {formatCurrency(totals.descuentos)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-600">
                    Impacto neto sobre planilla
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(totals.neto)}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                El signo ya viene aplicado: bonos suman, adelantos y descuentos
                restan.
              </p>
            </div>
          </div>
        )}
      </div>
    )
  }
  