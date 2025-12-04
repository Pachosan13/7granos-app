import React, { useCallback, useMemo, useState } from "react"
import { Calendar, Loader2, X } from "lucide-react"
import { supabase } from "../../lib/supabase"

type AdjustmentType = "adelanto" | "descuento" | "bono"
type ScheduleKind = "one_time" | "installments"

export interface EmployeeAdjustmentModalProps {
  open: boolean
  onClose: () => void
  // Lo mínimo que necesitamos del empleado / sucursal
  empleadoId: string
  empleadoNombre: string
  sucursalId: string
  sucursalNombre: string
  // Periodo de la quincena actual (YYYY-MM-DD)
  periodoActual: string
  // Para que Calcular.tsx pueda refrescar la planilla cuando guardamos
  onSaved?: () => void
}

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function EmployeeAdjustmentModal({
  open,
  onClose,
  empleadoId,
  empleadoNombre,
  sucursalId,
  sucursalNombre,
  periodoActual,
  onSaved,
}: EmployeeAdjustmentModalProps) {
  const [periodo, setPeriodo] = useState<string>(periodoActual || todayIso())
  const [tipo, setTipo] = useState<AdjustmentType>("adelanto")
  const [montoTotal, setMontoTotal] = useState<string>("")
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("one_time")
  const [cuotas, setCuotas] = useState<string>("4")
  const [nota, setNota] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cuotasNumber = useMemo(
    () => Math.max(1, Number.parseInt(cuotas || "1", 10)),
    [cuotas],
  )

  if (!open) return null

  const handleClose = () => {
    if (saving) return
    setError(null)
    onClose()
  }

  const handleSubmit: React.FormEventHandler = useCallback(
    async (event) => {
      event.preventDefault()
      if (saving) return

      const monto = Number(montoTotal)
      if (!monto || Number.isNaN(monto) || monto <= 0) {
        setError("Ingresa un monto válido mayor a 0.")
        return
      }

      setSaving(true)
      setError(null)

      try {
        const schedule: ScheduleKind = scheduleKind
        const totalCuotas = schedule === "one_time" ? 1 : cuotasNumber

        // 1) Insertar el plan de pago maestro
        const { data: inserted, error: insertError } = await supabase
          .from("payroll_ajustes")
          .insert([
            {
              periodo: periodo, // compatibilidad hacia atrás
              empleado_id: empleadoId,
              sucursal_id: sucursalId,
              tipo, // 'adelanto' | 'descuento' | 'bono'
              monto: monto, // compatibilidad hacia atrás
              monto_total: monto,
              saldo_pendiente: monto,
              schedule_kind: schedule,
              cuotas_total: totalCuotas,
              cuotas_pendientes: totalCuotas,
              periodo_inicio: periodo,
              nota: nota || null,
            },
          ])
          .select("id")
          .single()

        if (insertError) {
          throw insertError
        }

        const ajusteId = inserted?.id as string | undefined
        if (!ajusteId) {
          throw new Error("No se pudo obtener el ID del ajuste creado.")
        }

        // 2) Aplicar ajustes para el periodo actual de esa sucursal
        const { error: rpcError } = await supabase.rpc(
          "aplicar_ajustes_quincena",
          {
            p_periodo: periodo,
            p_sucursal_id: sucursalId,
          },
        )

        if (rpcError) {
          console.error("aplicar_ajustes_quincena error", rpcError)
          throw rpcError
        }

        // 3) Avisar al padre para que recargue planilla
        if (onSaved) {
          onSaved()
        }

        // Reset suave y cerrar
        setMontoTotal("")
        setNota("")
        setScheduleKind("one_time")
        setCuotas("4")
        setTipo("adelanto")

        onClose()
      } catch (err: any) {
        console.error("[EmployeeAdjustmentModal] error", err)
        setError(
          err?.message ??
            "No pudimos guardar el ajuste. Revisa Supabase / RLS.",
        )
      } finally {
        setSaving(false)
      }
    },
    [
      saving,
      montoTotal,
      scheduleKind,
      cuotasNumber,
      periodo,
      empleadoId,
      sucursalId,
      tipo,
      nota,
      onSaved,
      onClose,
    ],
  )

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Ajustes de planilla
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-800">
              {empleadoNombre}
            </span>{" "}
            · Los ajustes se aplican a la quincena seleccionada y se
            descuentan automáticamente según el plan de pago.
          </p>

          {/* Periodo + tipo */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Periodo
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <Calendar className="h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="w-full border-none bg-transparent text-sm text-slate-800 outline-none"
                  required
                />
              </div>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Tipo de ajuste
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as AdjustmentType)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                <option value="adelanto">Adelanto</option>
                <option value="descuento">Descuento</option>
                <option value="bono">Bono</option>
              </select>
            </label>
          </div>

          {/* Monto + forma de pago */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Monto total
              <input
                type="number"
                min={0}
                step="0.01"
                value={montoTotal}
                onChange={(e) => setMontoTotal(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="Ej. 400.00"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Forma de pago
              <select
                value={scheduleKind}
                onChange={(e) =>
                  setScheduleKind(e.target.value as ScheduleKind)
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                <option value="one_time">Todo en esta quincena</option>
                <option value="installments">
                  Dividir en varias quincenas
                </option>
              </select>
            </label>
          </div>

          {scheduleKind === "installments" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                Número de quincenas
                <input
                  type="number"
                  min={2}
                  max={48}
                  value={cuotas}
                  onChange={(e) => setCuotas(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="Ej. 4"
                  required
                />
              </label>
              <div className="flex flex-col justify-end text-xs text-slate-500">
                <span>
                  Se descontará aproximadamente{" "}
                  <span className="font-semibold text-slate-800">
                    {montoTotal && !Number.isNaN(Number(montoTotal))
                      ? (
                          Number(montoTotal) / cuotasNumber
                        ).toFixed(2)
                      : "0.00"}{" "}
                    USD
                  </span>{" "}
                  por quincena.
                </span>
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Nota / referencia (opcional)
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              placeholder="Ej. Adelanto de salario por préstamo personal."
            />
          </label>

          {error && (
            <p className="text-xs font-medium text-red-600">{error}</p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar ajuste
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
