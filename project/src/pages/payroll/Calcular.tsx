import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Download,
  Loader2,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"
import * as AuthOrgMod from "../../context/AuthOrgContext"
import { supabase, shouldUseDemoMode } from "../../lib/supabase"

type Row = {
  empleado_id: string
  empleado: string
  sucursal_id: string
  sucursal: string
  salario_base: number
  salario_quincenal: number
  seguro_social: number
  seguro_educativo: number
  total_deducciones: number
  salario_neto_quincenal: number
  // nuevos campos que vienen de v_ui_planilla_final
  ajustes_descuentos?: number | null
  ajustes_bonos?: number | null
  cerrada?: boolean | null
}

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

const MOCK_ROWS: Row[] = [
  {
    empleado_id: "demo-01",
    empleado: "Juan Pérez",
    sucursal_id: "demo",
    sucursal: "Sucursal demo",
    salario_base: 1200,
    salario_quincenal: 600,
    seguro_social: 58.5,
    seguro_educativo: 7.5,
    total_deducciones: 66,
    salario_neto_quincenal: 534,
  },
  {
    empleado_id: "demo-02",
    empleado: "María Gómez",
    sucursal_id: "demo",
    sucursal: "Sucursal demo",
    salario_base: 950,
    salario_quincenal: 475,
    seguro_social: 46.31,
    seguro_educativo: 5.94,
    total_deducciones: 52.25,
    salario_neto_quincenal: 422.75,
  },
  {
    empleado_id: "demo-03",
    empleado: "Carlos Rodríguez",
    sucursal_id: "demo",
    sucursal: "Sucursal demo",
    salario_base: 1500,
    salario_quincenal: 750,
    seguro_social: 73.13,
    seguro_educativo: 9.38,
    total_deducciones: 82.51,
    salario_neto_quincenal: 667.49,
  },
]

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

const toCsvValue = (value: string | number) => {
  if (typeof value === "number") {
    return value.toFixed(2)
  }
  if (value.includes(",") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

const buildMockRows = (sucursalId: string, sucursalNombre: string) =>
  MOCK_ROWS.map((row, index) => ({
    ...row,
    empleado_id: `${row.empleado_id}-${index + 1}`,
    sucursal_id: sucursalId,
    sucursal: sucursalNombre || row.sucursal,
  }))

// -----------------------------------------------------------------------------
// Modal de ajustes por empleado
// -----------------------------------------------------------------------------

type AdjustmentModalProps = {
  open: boolean
  onClose: () => void
  empleadoId: string | null
  empleadoNombre: string | null
  sucursalId: string | null
  onSaved: () => void
}

type AdjustmentFormState = {
  periodo: string
  tipo: "adelanto" | "descuento" | "bono"
  monto: string
  nota: string
}

function getTodayISO() {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function AdjustmentModal({
  open,
  onClose,
  empleadoId,
  empleadoNombre,
  sucursalId,
  onSaved,
}: AdjustmentModalProps) {
  const [form, setForm] = useState<AdjustmentFormState>({
    periodo: getTodayISO(),
    tipo: "adelanto",
    monto: "",
    nota: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm({
        periodo: getTodayISO(),
        tipo: "adelanto",
        monto: "",
        nota: "",
      })
      setError(null)
    }
  }, [open])

  if (!open || !empleadoId || !sucursalId) return null

  const handleSubmit: React.FormEventHandler = async (event) => {
    event.preventDefault()
    setError(null)

    const montoNumber = Number(form.monto)
    if (!montoNumber || Number.isNaN(montoNumber)) {
      setError("Ingresa un monto válido.")
      return
    }

    try {
      setSaving(true)

      // Solo guarda el ajuste; la aplicación global se hace al cerrar quincena
      const { error: insertError } = await supabase
        .from("payroll_ajustes")
        .insert({
          periodo: form.periodo,
          empleado_id: empleadoId,
          sucursal_id: sucursalId,
          tipo: form.tipo,
          monto: montoNumber,
          nota: form.nota ?? null,
        })

      if (insertError) {
        console.error(
          "[AdjustmentModal] Error insert payroll_ajustes",
          insertError
        )
        throw insertError
      }

      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || "No se pudo guardar el ajuste.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="flex-1 max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">
          Ajustes de planilla
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {empleadoNombre ?? "Colaborador"} · Los ajustes se registran para la
          quincena seleccionada.
        </p>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Periodo
              <input
                type="date"
                value={form.periodo}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, periodo: e.target.value }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Tipo de ajuste
              <select
                value={form.tipo}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    tipo: e.target.value as AdjustmentFormState["tipo"],
                  }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              >
                <option value="adelanto">Adelanto</option>
                <option value="descuento">Descuento</option>
                <option value="bono">Bono</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Monto
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={form.monto}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, monto: e.target.value }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Nota / referencia (opcional)
            <textarea
              rows={2}
              value={form.nota}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nota: e.target.value }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              placeholder="Ej. Adelanto de salario por préstamo personal."
            />
          </label>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-70"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Guardar ajuste
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Pantalla principal
// -----------------------------------------------------------------------------

export default function Calcular() {
  const { sucursales, sucursalSeleccionada, setSucursalSeleccionada } =
    useAuthOrg()

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [demoReason, setDemoReason] = useState<string | null>(null)

  const [attendancePendingCount, setAttendancePendingCount] = useState<
    number | null
  >(null)
  const [attendanceChecking, setAttendanceChecking] = useState(false)
  const [closingPayroll, setClosingPayroll] = useState(false)

  const [adjustmentEmpleadoId, setAdjustmentEmpleadoId] = useState<string | null>(
    null
  )
  const [adjustmentEmpleadoNombre, setAdjustmentEmpleadoNombre] = useState<
    string | null
  >(null)
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedSucursal = sucursalSeleccionada ?? null
  const currentSucursalId = selectedSucursal?.id ?? null
  const currentSucursalName = selectedSucursal?.nombre ?? ""

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

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const employeeName = (row.empleado ?? "").trim()
      return !/^reloj invu/i.test(employeeName)
    })
  }, [rows])

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.empleados += 1
        acc.base += Number(row.salario_base ?? 0)
        acc.bruto += Number(row.salario_quincenal ?? 0)
        acc.seguroSocial += Number(row.seguro_social ?? 0)
        acc.seguroEducativo += Number(row.seguro_educativo ?? 0)
        acc.deducciones += Number(row.total_deducciones ?? 0)
        acc.neto += Number(row.salario_neto_quincenal ?? 0)
        return acc
      },
      {
        empleados: 0,
        base: 0,
        bruto: 0,
        seguroSocial: 0,
        seguroEducativo: 0,
        deducciones: 0,
        neto: 0,
      }
    )
  }, [filteredRows])

  const clearIntervalRef = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const fetchRows = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!currentSucursalId) {
        clearIntervalRef()
        setRows([])
        setError("")
        setIsDemo(false)
        setDemoReason(null)
        setLastUpdated(null)
        setLoading(false)
        return
      }

      if (!options?.silent) {
        setLoading(true)
      }
      setError("")
      setIsDemo(false)
      setDemoReason(null)

      try {
        if (shouldUseDemoMode) {
          const mock = buildMockRows(currentSucursalId, currentSucursalName)
          setRows(mock)
          setIsDemo(true)
          setDemoReason("Modo demo habilitado.")
          return
        }

        const { data, error: queryError } = await supabase
          .from("v_ui_planilla_final")
          .select("*")
          .eq("sucursal_id", currentSucursalId)
          .order("empleado", { ascending: true })

        if (queryError) {
          throw queryError
        }

        setRows((data ?? []) as Row[])
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[Calcular] Error al cargar planilla quincenal", message)
        if (shouldUseDemoMode) {
          const mock = buildMockRows(currentSucursalId, currentSucursalName)
          setRows(mock)
          setIsDemo(true)
          setDemoReason(message)
          setError("")
        } else {
          setRows([])
          setError(message || "No se pudo cargar la planilla quincenal.")
        }
      } finally {
        if (!options?.silent) {
          setLoading(false)
        }
        setLastUpdated(new Date())
      }
    },
    [clearIntervalRef, currentSucursalId, currentSucursalName]
  )

  const fetchAttendanceAlerts = useCallback(async () => {
    if (!currentSucursalId) {
      setAttendancePendingCount(null)
      return
    }
    try {
      setAttendanceChecking(true)
      const { data, error: attError } = await supabase
        .from("v_ui_attendance")
        .select("id, check_in, check_out")
        .eq("sucursal_id", currentSucursalId)

      if (attError) throw attError

      const pending = (data ?? []).filter(
        (row: any) => !row.check_in || !row.check_out
      ).length

      setAttendancePendingCount(pending)
    } catch (err) {
      console.error("[Calcular] Error revisando marcaciones pendientes", err)
      setAttendancePendingCount(null)
    } finally {
      setAttendanceChecking(false)
    }
  }, [currentSucursalId])

  useEffect(() => {
    void fetchRows()
    void fetchAttendanceAlerts()
  }, [fetchRows, fetchAttendanceAlerts])

  useEffect(() => {
    clearIntervalRef()
    if (!autoRefresh || !currentSucursalId) {
      return
    }
    const id = setInterval(() => {
      void fetchRows({ silent: true })
      void fetchAttendanceAlerts()
    }, 60_000)
    intervalRef.current = id
    return () => {
      clearInterval(id)
    }
  }, [
    autoRefresh,
    clearIntervalRef,
    currentSucursalId,
    fetchRows,
    fetchAttendanceAlerts,
  ])

  useEffect(() => () => clearIntervalRef(), [clearIntervalRef])

  const handleRefresh = useCallback(() => {
    void fetchRows()
    void fetchAttendanceAlerts()
  }, [fetchRows, fetchAttendanceAlerts])

  const hiddenClockEntries = useMemo(
    () => rows.length - filteredRows.length,
    [filteredRows, rows]
  )

  const handleDownloadCsv = useCallback(() => {
    if (!filteredRows.length || typeof window === "undefined") return

    const header = [
      "Empleado",
      "Sucursal",
      "Salario base",
      "Bruto quincenal",
      "Seguro social",
      "Seguro educativo",
      "Total deducciones",
      "Neto quincenal",
    ]

    const csvRows = filteredRows.map((row) =>
      [
        toCsvValue(row.empleado),
        toCsvValue(row.sucursal),
        toCsvValue(row.salario_base),
        toCsvValue(row.salario_quincenal),
        toCsvValue(row.seguro_social),
        toCsvValue(row.seguro_educativo),
        toCsvValue(row.total_deducciones),
        toCsvValue(row.salario_neto_quincenal),
      ].join(",")
    )

    const csvContent = [header.join(","), ...csvRows].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement("a")
    link.href = url
    const safeName = currentSucursalName
      ? currentSucursalName.replace(/\s+/g, "-").toLowerCase()
      : "planilla"
    link.download = `planilla-quincenal-${safeName}.csv`
    window.document.body.appendChild(link)
    link.click()
    window.document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }, [currentSucursalName, filteredRows])

  const handleToggleAutoRefresh = useCallback(() => {
    setAutoRefresh((prev) => !prev)
  }, [])

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

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return ""
    try {
      return lastUpdated.toLocaleString("es-PA", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    } catch (err) {
      console.error("[Calcular] No se pudo formatear fecha", err)
      return lastUpdated.toISOString()
    }
  }, [lastUpdated])

  const showEmptyState =
    !loading && !error && !!currentSucursalId && filteredRows.length === 0

  const isClosed = useMemo(() => {
    if (!rows.length) return false
    // asumimos mismo estado para toda la quincena
    return Boolean(rows[0].cerrada)
  }, [rows])

  const handleOpenAdjustment = (row: Row) => {
    if (!currentSucursalId) return
    setAdjustmentEmpleadoId(row.empleado_id)
    setAdjustmentEmpleadoNombre(row.empleado)
    setAdjustmentOpen(true)
  }

  const handleClosePayroll = useCallback(async () => {
    if (!currentSucursalId) return

    const pending = attendancePendingCount ?? 0
    const mensajeBase = pending
      ? `Hay ${pending} marcaciones pendientes en esta sucursal.\n\n¿Seguro que quieres cerrar la quincena y aplicar ajustes de todas formas?`
      : "¿Cerrar la quincena y aplicar ajustes?"

    if (!window.confirm(mensajeBase)) return

    try {
      setClosingPayroll(true)
      const { error: rpcError } = await supabase.rpc(
        "aplicar_ajustes_quincena"
      )
      if (rpcError) throw rpcError

      await fetchRows()
      await fetchAttendanceAlerts()
      window.alert("Quincena cerrada y ajustes aplicados.")
    } catch (err) {
      console.error("[Calcular] Error al cerrar quincena", err)
      window.alert(
        "No se pudo cerrar la quincena. Revisa Supabase / consola para más detalles."
      )
    } finally {
      setClosingPayroll(false)
    }
  }, [
    attendancePendingCount,
    currentSucursalId,
    fetchAttendanceAlerts,
    fetchRows,
  ])

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 rounded-2xl border bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Planilla quincenal
          </h1>
          <p className="text-sm text-slate-600">
            Consulta directa de Supabase · v_ui_planilla_final.
          </p>
          {lastUpdatedLabel && (
            <p className="mt-2 text-xs text-slate-500">
              Última actualización: {lastUpdatedLabel}
            </p>
          )}
          {isDemo && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700">
              <AlertCircle className="h-3 w-3" />
              Modo demo activo{demoReason ? ` · ${demoReason}` : ""}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {sucursales.length > 0 ? (
            <label className="flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2 text-sm text-slate-700 shadow-inner">
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

          <div className="flex flex-wrap items-center gap-2">
            {/* Badge de estado: Planilla abierta / cerrada */}
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                isClosed
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isClosed ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {isClosed ? "Planilla cerrada" : "Planilla abierta"}
            </span>

            {/* Refrescar */}
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refrescar
            </button>

            {/* Descargar CSV */}
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              disabled={!filteredRows.length}
            >
              <Download className="h-4 w-4" />
              Descargar CSV
            </button>

            {/* Auto Refresh */}
            <button
              type="button"
              onClick={handleToggleAutoRefresh}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition ${
                autoRefresh
                  ? "bg-emerald-500 text-white hover:bg-emerald-600"
                  : "border text-slate-700 hover:bg-slate-50"
              }`}
              aria-pressed={autoRefresh}
            >
              {autoRefresh ? (
                <ToggleRight className="h-4 w-4" />
              ) : (
                <ToggleLeft className="h-4 w-4" />
              )}
              Auto-refresh
            </button>
          </div>
        </div>
      </div>

      {/* ESTADOS */}
      {!currentSucursalId ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-600 shadow-sm">
          Selecciona una sucursal para ver la planilla quincenal.
        </div>
      ) : loading ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-slate-500" />
          <p className="text-sm text-slate-600">Cargando planilla…</p>
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
          No hay empleados visibles con planilla generada para esta sucursal.
          {hiddenClockEntries > 0 && (
            <span className="mt-2 block text-xs text-slate-400">
              Se ocultaron{" "}
              {hiddenClockEntries === 1
                ? "1 registro"
                : `${hiddenClockEntries} registros`}{" "}
              de Reloj INVU.
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {/* DETALLE EMPLEADOS */}
            <div className="rounded-2xl border bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Detalle de empleados
                  </h2>
                  {lastUpdatedLabel && (
                    <p className="text-xs text-slate-500">
                      Última actualización: {lastUpdatedLabel}
                    </p>
                  )}
                  {hiddenClockEntries > 0 && (
                    <p className="mt-1 text-xs text-slate-400">
                      {hiddenClockEntries === 1
                        ? "1 registro de Reloj INVU se ocultó del resumen."
                        : `${hiddenClockEntries} registros de Reloj INVU se ocultaron del resumen.`}
                    </p>
                  )}
                </div>
              </div>
              <div className="relative">
                <div className="max-h-[520px] overflow-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-6 py-3 font-medium">Empleado</th>
                        <th className="px-3 py-3 font-medium">Sucursal</th>
                        <th className="px-3 py-3 font-medium text-center">
                          Ajustes
                        </th>
                        <th className="px-3 py-3 font-medium text-right">
                          Salario base
                        </th>
                        <th className="px-3 py-3 font-medium text-right">
                          Bruto quincenal
                        </th>
                        <th className="px-3 py-3 font-medium text-right">
                          Seguro social
                        </th>
                        <th className="px-3 py-3 font-medium text-right">
                          Seguro educativo
                        </th>
                        <th className="px-3 py-3 font-medium text-right">
                          Total deducciones
                        </th>
                        <th className="px-6 py-3 font-medium text-right">
                          Neto quincenal
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      {filteredRows.map((row) => (
                        <tr
                          key={row.empleado_id}
                          className="hover:bg-slate-50/60"
                        >
                          <td className="px-6 py-4 align-middle font-medium text-slate-900">
                            {row.empleado}
                          </td>
                          <td className="px-3 py-4 align-middle">
                            {row.sucursal}
                          </td>
                          <td className="px-3 py-4 align-middle text-center">
                            <button
                              type="button"
                              onClick={() => handleOpenAdjustment(row)}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Ajustes
                            </button>
                            {(row.ajustes_descuentos || row.ajustes_bonos) && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                {row.ajustes_descuentos
                                  ? `-${formatCurrency(
                                      row.ajustes_descuentos
                                    )}`
                                  : null}
                                {row.ajustes_bonos
                                  ? ` · +${formatCurrency(
                                      row.ajustes_bonos
                                    )}`
                                  : null}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-4 align-middle text-right font-medium text-slate-900">
                            {formatCurrency(row.salario_base)}
                          </td>
                          <td className="px-3 py-4 align-middle text-right">
                            {formatCurrency(row.salario_quincenal)}
                          </td>
                          <td className="px-3 py-4 align-middle text-right">
                            {formatCurrency(row.seguro_social)}
                          </td>
                          <td className="px-3 py-4 align-middle text-right">
                            {formatCurrency(row.seguro_educativo)}
                          </td>
                          <td className="px-3 py-4 align-middle text-right font-medium text-slate-900">
                            {formatCurrency(row.total_deducciones)}
                          </td>
                          <td className="px-6 py-4 align-middle text-right font-semibold text-emerald-600">
                            {formatCurrency(row.salario_neto_quincenal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="sticky bottom-0 bg-slate-100 text-sm font-semibold text-slate-900 shadow-[0_-4px_6px_-4px_rgba(15,23,42,0.25)]">
                        <td className="px-6 py-4" colSpan={3}>
                          Totales visibles ({totals.empleados})
                        </td>
                        <td className="px-3 py-4 text-right">
                          {formatCurrency(totals.base)}
                        </td>
                        <td className="px-3 py-4 text-right">
                          {formatCurrency(totals.bruto)}
                        </td>
                        <td className="px-3 py-4 text-right">
                          {formatCurrency(totals.seguroSocial)}
                        </td>
                        <td className="px-3 py-4 text-right">
                          {formatCurrency(totals.seguroEducativo)}
                        </td>
                        <td className="px-3 py-4 text-right">
                          {formatCurrency(totals.deducciones)}
                        </td>
                        <td className="px-6 py-4 text-right text-emerald-700">
                          {formatCurrency(totals.neto)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* RESUMEN + ALERTAS + CIERRE */}
            <div className="flex flex-col gap-5 rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Resumen de totales
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!filteredRows.length}
                  >
                    <Download className="h-4 w-4" />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleClosePayroll}
                    disabled={closingPayroll || isClosed}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-70"
                  >
                    {closingPayroll && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {isClosed ? "Quincena cerrada" : "Cerrar quincena"}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Empleados
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {totals.empleados}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Salario base total
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(totals.base)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Bruto total
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(totals.bruto)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Seguro social
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(totals.seguroSocial)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Seguro educativo
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(totals.seguroEducativo)}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-emerald-600">
                    Neto total
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-700">
                    {formatCurrency(totals.neto)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center md:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Deducciones
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(totals.deducciones)}
                  </p>
                </div>
              </div>

              {/* ALERTA DE MARCACIONES PENDIENTES */}
              <div className="mt-2 space-y-2 text-xs">
                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  {attendanceChecking ? (
                    <span>Revisando marcaciones pendientes…</span>
                  ) : attendancePendingCount && attendancePendingCount > 0 ? (
                    <span>
                      Hay{" "}
                      <strong>{attendancePendingCount}</strong> marcaciones
                      incompletas (entrada o salida faltante). Revisa la
                      pantalla de <strong>Marcaciones</strong> antes de cerrar.
                    </span>
                  ) : (
                    <span>
                      No se detectan marcaciones pendientes en esta sucursal
                      para el período consultado.
                    </span>
                  )}
                </div>
              </div>

              {isDemo && (
                <p className="text-xs text-slate-500">
                  Exportar CSV en modo demo descarga datos simulados.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <AdjustmentModal
        open={adjustmentOpen}
        onClose={() => setAdjustmentOpen(false)}
        empleadoId={adjustmentEmpleadoId}
        empleadoNombre={adjustmentEmpleadoNombre}
        sucursalId={currentSucursalId}
        onSaved={() => {
          void fetchRows()
        }}
      />
    </div>
  )
}
