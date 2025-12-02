import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { CalendarDays, Clock, RefreshCw, Store } from 'lucide-react';
import { supabase, shouldUseDemoMode } from '../lib/supabase';
import { formatCurrencyUSD } from '../lib/format';
import { useAuthOrg } from '../context/AuthOrgContext';
import KpiCard from '../components/dashboard/KpiCard';
import BarSeries from '../components/dashboard/BarSeries';
import Leaderboard, { LeaderboardRow } from '../components/dashboard/Leaderboard';
import DonutTop5, { TopProductItem } from '../components/dashboard/DonutTop5';
import HeatmapHours, { HeatmapPoint } from '../components/dashboard/HeatmapHours';
import AlertPill from '../components/dashboard/AlertPill';
import { useResumenVentas } from '../hooks/useResumenVentas';

interface Summary7d {
  ventas_netas: number;
  cogs: number;
  gastos: number;
  utilidad: number;
  tx: number;
  ticket_promedio: number;
  margen_bruto_pct: number;
  ventas_vs_semana_ant_pct: number | null;
}

interface SeriesPoint {
  d: string;
  ventas_netas: number;
  itbms?: number | null;
  tx: number;
}

type NullableNumber = number | string | null | undefined;

interface SummaryRowPayload {
  ventas_netas?: NullableNumber;
  cogs?: NullableNumber;
  gastos?: NullableNumber;
  utilidad?: NullableNumber;
  tx?: NullableNumber;
  ticket_promedio?: NullableNumber;
  margen_bruto_pct?: NullableNumber;
  ventas_vs_semana_ant_pct?: NullableNumber;
}

interface SeriesRowPayload {
  d?: string | null;
  dia?: string | null;
  ventas_netas?: NullableNumber;
  ventas?: NullableNumber;
  itbms?: NullableNumber;
  tx?: NullableNumber;
  transacciones?: NullableNumber;
}

interface RankingRowPayload {
  sucursal_id?: string | number | null;
  sucursal_nombre?: string | null;
  ventas?: NullableNumber;
  cogs?: NullableNumber;
  gastos?: NullableNumber;
  utilidad?: NullableNumber;
  margen_pct?: NullableNumber;
}

interface TopProductRowPayload {
  producto?: string | null;
  qty?: NullableNumber;
  ventas?: NullableNumber;
}

interface HeatmapRowPayload {
  hora?: NullableNumber;
  ventas?: NullableNumber;
  tx?: NullableNumber;
}

interface AlertRowPayload {
  code?: string | null;
  level?: string | null;
  message?: string | null;
}

interface PlanillaRowPayload {
  total?: NullableNumber;
  empleados?: NullableNumber;
  costo_promedio?: NullableNumber;
  horas_extra?: NullableNumber;
  ausencias?: NullableNumber;
}

type RpcParamValue = string | number | boolean | null | undefined;
type RpcParams = Record<string, RpcParamValue>;

function toNumber(value: NullableNumber): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableNumber(value: NullableNumber): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = toNumber(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeParams(params: RpcParams): Record<string, RpcParamValue> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as Record<string, RpcParamValue>;
}

async function rpcWithFallback<T>(fn: string, variants: RpcParams[]): Promise<T | null> {
  let lastError: PostgrestError | Error | null = null;
  for (let index = 0; index < variants.length; index += 1) {
    const params = normalizeParams(variants[index]);
    const response = await supabase.rpc<T>(fn, params as Record<string, unknown>);
    if (!response.error) {
      if (index > 0) {
        console.warn(`[dashboard] ${fn} ejecutado con firma alternativa #${index + 1}`, params);
      }
      return response.data ?? null;
    }
    lastError = response.error;
  }
  throw lastError ?? new Error(`No se pudo ejecutar ${fn}`);
}

interface PlanillaSnapshot {
  total: number;
  empleados: number;
  costo_promedio: number;
  horas_extra: number;
  ausencias: number;
}

interface AlertItem {
  code: string;
  level: 'info' | 'warn';
  message: string;
}

interface CashflowSnapshot {
  diasCaja: number;
  puntoEquilibrio: number;
}

const fmt = (date: Date) => date.toLocaleDateString('en-CA');

function sevenDayWindow(includeToday: boolean) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (includeToday ? 0 : 1));
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { desde: fmt(start), hasta: fmt(end) };
}

function addDays(iso: string, delta: number) {
  const base = new Date(`${iso}T00:00:00`);
  base.setDate(base.getDate() + delta);
  return fmt(base);
}

function formatRangeLabel(desde: string, hasta: string) {
  const start = new Date(desde);
  const end = new Date(hasta);
  const sameMonth = start.getMonth() === end.getMonth();
  const opts: Intl.DateTimeFormatOptions = sameMonth
    ? { day: '2-digit' }
    : { day: '2-digit', month: 'short' };
  const startLabel = start.toLocaleDateString('es-PA', opts);
  const endLabel = end.toLocaleDateString('es-PA', {
    day: '2-digit',
    month: 'short',
  });
  return `${startLabel} – ${endLabel}`;
}

function safeFormatRangeLabel(desde: string, hasta: string) {
  if (!desde || !hasta) {
    return 'Rango pendiente';
  }
  try {
    return formatRangeLabel(desde, hasta);
  } catch {
    const start = desde || '—';
    const end = hasta || '—';
    return `${start} – ${end}`;
  }
}

function buildDemoData(): {
  summary: Summary7d;
  series: SeriesPoint[];
  ranking: LeaderboardRow[];
  top: TopProductItem[];
  heatmap: HeatmapPoint[];
  alerts: AlertItem[];
  planilla: PlanillaSnapshot;
  range: { desde: string; hasta: string };
} {
  const { desde, hasta } = sevenDayWindow(true);
  const chartRange = { desde: addDays(desde, -7), hasta };
  const baseVentas = 32000;
  const summary: Summary7d = {
    ventas_netas: baseVentas,
    cogs: 18000,
    gastos: 9000,
    utilidad: baseVentas - 18000 - 9000,
    tx: 1640,
    ticket_promedio: baseVentas / 1640,
    margen_bruto_pct: (baseVentas - 18000) / baseVentas,
    ventas_vs_semana_ant_pct: 0.12,
  };
  const series: SeriesPoint[] = Array.from({ length: 14 }, (_, idx) => {
    const day = addDays(chartRange.desde, idx);
    const ventas = 1800 + Math.sin(idx / 2) * 250 + (idx > 7 ? 150 : 0);
    return { d: day, ventas_netas: Math.round(ventas), tx: Math.round(ventas / 18) };
  });
  const ranking: LeaderboardRow[] = [
    { sucursal_id: 'centro', sucursal_nombre: 'Centro', ventas: 18000, cogs: 9000, gastos: 4500, utilidad: 4500, margen_pct: 0.25 },
    { sucursal_id: 'norte', sucursal_nombre: 'Norte', ventas: 9000, cogs: 5400, gastos: 3200, utilidad: 400, margen_pct: 0.044 },
    { sucursal_id: 'oeste', sucursal_nombre: 'Oeste', ventas: 5000, cogs: 3200, gastos: 1300, utilidad: 500, margen_pct: 0.1 },
  ];
  const top: TopProductItem[] = [
    { producto: 'Café Geisha', qty: 130, ventas: 7800 },
    { producto: 'Emparedado Artesanal', qty: 210, ventas: 6500 },
    { producto: 'Bebida Energética', qty: 190, ventas: 4200 },
    { producto: 'Pan de Masa Madre', qty: 160, ventas: 3600 },
    { producto: 'Smoothie Tropical', qty: 150, ventas: 3300 },
  ];
  const heatmap: HeatmapPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hora: hour,
    ventas: Math.max(0, Math.round(200 * Math.sin((hour - 8) / 3) + (hour > 12 && hour < 15 ? 180 : 60))),
    tx: Math.max(0, Math.round(12 * Math.sin((hour - 8) / 3) + (hour > 12 && hour < 15 ? 10 : 3))),
  }));
  const alerts: AlertItem[] = [
    {
      code: 'ventas_delta',
      level: 'info',
      message: 'Ventas arriba 12.0% vs semana anterior',
    },
  ];
  const planilla: PlanillaSnapshot = {
    total: 5200,
    empleados: 28,
    costo_promedio: 185.7,
    horas_extra: 42,
    ausencias: 3,
  };
  return { summary, series, ranking, top, heatmap, alerts, planilla, range: { desde, hasta } };
}

async function fetchSummary(desde: string, hasta: string, sucursalId: string | null): Promise<Summary7d | null> {
  const payload =
    (await rpcWithFallback<SummaryRowPayload[]>(
      'api_dashboard_summary_7d',
      [
        { p_desde: desde, p_hasta: hasta, p_sucursal_id: sucursalId },
        { desde, hasta, p_sucursal_id: sucursalId },
        { desde, hasta, sucursal_id: sucursalId },
        { desde, hasta },
      ]
    )) ?? [];

  const row = payload[0];
  if (!row) {
    return null;
  }

  return {
    ventas_netas: toNumber(row.ventas_netas),
    cogs: toNumber(row.cogs),
    gastos: toNumber(row.gastos),
    utilidad: toNumber(row.utilidad),
    tx: toNumber(row.tx),
    ticket_promedio: toNumber(row.ticket_promedio),
    margen_bruto_pct: toNumber(row.margen_bruto_pct),
    ventas_vs_semana_ant_pct: toNullableNumber(row.ventas_vs_semana_ant_pct),
  };
}

async function fetchSeries(desde: string, hasta: string, sucursalId: string | null): Promise<SeriesPoint[]> {
  const payload =
    (await rpcWithFallback<SeriesRowPayload[]>(
      'rpc_ui_series_14d',
      [
        { p_desde: desde, p_hasta: hasta, p_sucursal_id: sucursalId },
        { desde, hasta, p_sucursal_id: sucursalId },
        { desde, hasta, sucursal_id: sucursalId },
        { desde, hasta },
      ]
    )) ?? [];

  return payload
    .map<SeriesPoint | null>((row) => {
      const dateValue = row.d ?? row.dia ?? null;
      if (!dateValue) {
        return null;
      }
      return {
        d: dateValue,
        ventas_netas: toNumber(row.ventas_netas ?? row.ventas),
        itbms: toNullableNumber(row.itbms),
        tx: toNumber(row.tx ?? row.transacciones),
      };
    })
    .filter((row): row is SeriesPoint => Boolean(row));
}

async function fetchRanking(desde: string, hasta: string): Promise<LeaderboardRow[]> {
  const payload =
    (await rpcWithFallback<RankingRowPayload[]>(
      'api_dashboard_ranking_7d',
      [
        { p_desde: desde, p_hasta: hasta },
        { desde, hasta },
      ]
    )) ?? [];

  return payload.map((row) => ({
    sucursal_id: String(row.sucursal_id ?? 'sin-id'),
    sucursal_nombre: row.sucursal_nombre ?? undefined,
    ventas: toNumber(row.ventas),
    cogs: toNumber(row.cogs),
    gastos: toNumber(row.gastos),
    utilidad: toNumber(row.utilidad),
    margen_pct: toNumber(row.margen_pct),
  }));
}

async function fetchTopProducts(desde: string, hasta: string, sucursalId: string | null): Promise<TopProductItem[]> {
  try {
    const payload =
      (await rpcWithFallback<TopProductRowPayload[]>(
        'api_dashboard_top_productos_7d',
        [
          { p_desde: desde, p_hasta: hasta, p_sucursal_id: sucursalId },
          { desde, hasta, p_sucursal_id: sucursalId },
          { desde, hasta, sucursal_id: sucursalId },
          { desde, hasta },
        ]
      )) ?? [];

    return payload.map((row) => ({
      producto: row.producto ?? 'Producto',
      qty: toNumber(row.qty),
      ventas: toNumber(row.ventas),
    }));
  } catch (err) {
    console.warn('[dashboard] api_dashboard_top_productos_7d no disponible', err);
    return [];
  }
}

async function fetchHeatmap(desde: string, hasta: string, sucursalId: string | null): Promise<HeatmapPoint[]> {
  try {
    const payload =
      (await rpcWithFallback<HeatmapRowPayload[]>(
        'api_dashboard_heatmap_hora_7d',
        [
          { p_desde: desde, p_hasta: hasta, p_sucursal_id: sucursalId },
          { desde, hasta, p_sucursal_id: sucursalId },
          { desde, hasta, sucursal_id: sucursalId },
          { desde, hasta },
        ]
      )) ?? [];

    return payload.map((row) => ({
      hora: toNumber(row.hora),
      ventas: toNumber(row.ventas),
      tx: toNumber(row.tx),
    }));
  } catch (err) {
    console.warn('[dashboard] api_dashboard_heatmap_hora_7d no disponible', err);
    return [];
  }
}

async function fetchAlerts(desde: string, hasta: string, sucursalId: string | null): Promise<AlertItem[]> {
  try {
    const payload =
      (await rpcWithFallback<AlertRowPayload[]>(
        'api_dashboard_alertas_7d',
        [
          { p_desde: desde, p_hasta: hasta, p_sucursal_id: sucursalId },
          { desde, hasta, p_sucursal_id: sucursalId },
          { desde, hasta, sucursal_id: sucursalId },
          { desde, hasta },
        ]
      )) ?? [];

    return payload.map((row) => ({
      code: String(row.code ?? 'alert'),
      level: row.level === 'warn' ? 'warn' : 'info',
      message: row.message ?? '',
    }));
  } catch (err) {
    console.warn('[dashboard] api_dashboard_alertas_7d no disponible', err);
    return [];
  }
}

async function fetchPlanillaSnapshot(desde: string, hasta: string, sucursalId: string | null): Promise<PlanillaSnapshot | null> {
  try {
    const payload =
      (await rpcWithFallback<PlanillaRowPayload[]>(
        'api_dashboard_planilla_snapshot',
        [
          { p_desde: desde, p_hasta: hasta, p_sucursal_id: sucursalId },
          { desde, hasta, p_sucursal_id: sucursalId },
          { desde, hasta, sucursal_id: sucursalId },
          { desde, hasta },
        ]
      )) ?? [];

    const row = payload[0];
    if (!row) {
      return null;
    }

    return {
      total: toNumber(row.total),
      empleados: toNumber(row.empleados),
      costo_promedio: toNumber(row.costo_promedio),
      horas_extra: toNumber(row.horas_extra),
      ausencias: toNumber(row.ausencias),
    };
  } catch (err) {
    console.warn('[dashboard] api_dashboard_planilla_snapshot no disponible', err);
    return null;
  }
}

function computeCashflow(summary: Summary7d | null): CashflowSnapshot {
  if (!summary) {
    return { diasCaja: 0, puntoEquilibrio: 0 };
  }
  const gastosDiarios = summary.gastos / 7;
  const utilidad = summary.utilidad;
  const margen = summary.margen_bruto_pct;
  const diasCaja = gastosDiarios > 0 ? Math.max(0, utilidad / gastosDiarios) : 0;
  const puntoEquilibrio = margen > 0 ? summary.gastos / margen : 0;
  return { diasCaja, puntoEquilibrio };
}

export default function DashboardExecutive() {
  const { sucursales, sucursalSeleccionada, setSucursalSeleccionada, isAdmin } = useAuthOrg();
  const [summary, setSummary] = useState<Summary7d | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [ranking, setRanking] = useState<LeaderboardRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductItem[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [planillaSnapshot, setPlanillaSnapshot] = useState<PlanillaSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [range, setRange] = useState(() => sevenDayWindow(true));

  const selectedSucursalId = sucursalSeleccionada?.id ?? null;
  const {
    data: resumenVentas,
    loading: resumenLoading,
    error: resumenError,
  } = useResumenVentas({
    desde: range.desde,
    hasta: range.hasta,
    sucursalId: selectedSucursalId,
  });

  const loadData = useCallback(async () => {
    if (shouldUseDemoMode) {
      const demo = buildDemoData();
      setSummary(demo.summary);
      setSeries(demo.series);
      setRanking(demo.ranking);
      setTopProducts(demo.top);
      setHeatmap(demo.heatmap);
      setAlerts(demo.alerts);
      setPlanillaSnapshot(demo.planilla);
      setRange(demo.range);
      setUsedFallback(false);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
      setError(null);
    try {
      const primaryRange = sevenDayWindow(true);
      const chartDesde = addDays(primaryRange.desde, -7);
      const initialSeries = await fetchSeries(chartDesde, primaryRange.hasta, selectedSucursalId);
      let effectiveRange = primaryRange;
      let seriesData = initialSeries;
      let fallback = false;

      const lastPoint = initialSeries.at(-1);
      const hasTodayData = lastPoint && lastPoint.d === primaryRange.hasta && (lastPoint.ventas_netas > 0 || lastPoint.tx > 0);
      if (!hasTodayData) {
        const altRange = sevenDayWindow(false);
        const altChartDesde = addDays(altRange.desde, -7);
        seriesData = await fetchSeries(altChartDesde, altRange.hasta, selectedSucursalId);
        effectiveRange = altRange;
        fallback = true;
      } else {
        // keep chartDesde for context although no badge displayed
      }

      const [summaryData, rankingData, topData, heatmapData, alertData, planillaData] = await Promise.all([
        fetchSummary(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId),
        fetchRanking(effectiveRange.desde, effectiveRange.hasta),
        fetchTopProducts(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId),
        fetchHeatmap(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId),
        fetchAlerts(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId),
        fetchPlanillaSnapshot(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId),
      ]);

      setSummary(summaryData);
      setSeries(seriesData);
      setRanking(rankingData);
      setTopProducts(topData);
      setHeatmap(heatmapData);
      setAlerts(alertData);
      setPlanillaSnapshot(planillaData);
      setRange(effectiveRange);
      setUsedFallback(fallback);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar los datos del tablero.';
      console.error('[dashboard] Error cargando datos', err);
      setError(message);
      setSummary(null);
      setSeries([]);
      setRanking([]);
      setTopProducts([]);
      setHeatmap([]);
      setAlerts([]);
      setPlanillaSnapshot(null);
      setUsedFallback(false);
    } finally {
      setLoading(false);
    }
  }, [selectedSucursalId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sucursalesOptions = useMemo(() => sucursales ?? [], [sucursales]);

  const cashflow = useMemo(() => computeCashflow(summary), [summary]);
  const rangeLabel = useMemo(() => safeFormatRangeLabel(range.desde, range.hasta), [range.desde, range.hasta]);

  const resumenData = resumenVentas?.resumen;
  const ventasNetas = resumenData?.ventasNetas ?? 0;
  const cogs = resumenData?.cogs ?? 0;
  const gastos = resumenData?.gastos ?? 0;
  const numTransacciones = resumenData?.numTransacciones ?? 0;
  const ticketPromedio = numTransacciones > 0 ? ventasNetas / numTransacciones : 0;
  const margenBrutoPct = ventasNetas > 0 ? ((ventasNetas - cogs) / ventasNetas) * 100 : 0;
  const summaryError = error ?? resumenError;
  const showSkeleton = (loading || resumenLoading) && !summary && !resumenData;

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-8">
      <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Dashboard Ejecutivo</h1>
            <p className="text-sm text-slate-500">
              Ventas, costos y rentabilidad consolidados en los últimos 7 días.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {usedFallback ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800">
                <Clock className="h-4 w-4" /> Datos hasta ayer
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-800">
                <Clock className="h-4 w-4" /> Datos al día
              </span>
            )}
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-[#4B2E05] px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#3a2303] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                <CalendarDays className="h-4 w-4" /> {rangeLabel}
              </span>
              <span className="inline-flex items-center gap-2 text-slate-500">
                Ventana de 7 días ({range.desde || '—'} → {range.hasta || '—'})
              </span>
            </div>
            {isAdmin ? (
              <label className="flex flex-col text-sm text-slate-600">
                <span className="mb-1 font-medium text-slate-500">Sucursal</span>
                <select
                  value={selectedSucursalId ?? ''}
                  onChange={(event) => {
                    const value = event.target.value || null;
                    const branch = sucursalesOptions.find((s) => s.id === value) ?? null;
                    setSucursalSeleccionada(branch ?? null);
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
            ) : selectedSucursalId ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                <Store className="h-4 w-4" />{' '}
                {sucursalesOptions.find((s) => s.id === selectedSucursalId)?.nombre ?? 'Sucursal seleccionada'}
              </div>
            ) : null}
          </div>
          {summaryError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {summaryError}
            </div>
          ) : null}
        </section>

        <section>
          {showSkeleton ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                title="Ventas Netas"
                value={ventasNetas}
                deltaPct={summary?.ventas_vs_semana_ant_pct ?? null}
                tooltip="Comparado con la semana anterior"
              />
              <KpiCard
                title="COGS"
                value={cogs}
                tooltip="Costo de bienes vendidos"
              />
              <KpiCard
                title="Gastos"
                value={gastos}
                tooltip="Planilla + gastos fijos"
              />
              <KpiCard
                title="Utilidad"
                value={ventasNetas - cogs - gastos}
                tooltip="Ventas - COGS - Gastos"
                highlight="warning"
              />
              <KpiCard
                title="Ticket Promedio"
                value={ticketPromedio}
                formatter={(value) => formatCurrencyUSD(value)}
                tooltip="Ventas / Transacciones"
              />
              <KpiCard
                title="Margen Bruto %"
                value={margenBrutoPct}
                formatter={(value) => `${value.toFixed(1)}%`}
                tooltip="(Ventas - COGS) / Ventas"
              />
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Serie 14 días</h2>
                <p className="text-sm text-slate-500">Evolución de ventas y transacciones</p>
              </div>
            </div>
            <div className="h-[360px] px-6 pb-6">
              {series.length ? <BarSeries data={series} /> : <EmptyState message="Sin datos disponibles para la serie." />}
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Top 5 Productos</h2>
              <p className="text-sm text-slate-500">Basado en ventas netas del período</p>
              <div className="mt-4">
                <DonutTop5 items={topProducts} />
              </div>
            </div>
            <HeatmapHours data={heatmap} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Ranking de sucursales</h2>
            <Leaderboard
              rows={ranking.map((row) => ({
                ...row,
                sucursal_nombre:
                  row.sucursal_nombre || sucursalesOptions.find((s) => s.id === row.sucursal_id)?.nombre,
              }))}
            />
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Snapshot planilla</h3>
              {planillaSnapshot ? (
                <dl className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <div className="flex items-center justify-between">
                    <dt>Total mes</dt>
                    <dd className="font-semibold text-[#4B2E05]">{formatCurrencyUSD(planillaSnapshot.total)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Empleados</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">{planillaSnapshot.empleados}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Costo/empleado</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      {formatCurrencyUSD(planillaSnapshot.costo_promedio)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Horas extra</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">{planillaSnapshot.horas_extra}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Ausencias</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">{planillaSnapshot.ausencias}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Sin datos de planilla para el mes en curso. Verifica la sincronización de recursos humanos.
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Cashflow simple</h3>
              <dl className="mt-4 space-y-4 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center justify-between">
                  <dt>Días de caja</dt>
                  <dd className="text-lg font-semibold text-[#4B2E05]">{cashflow.diasCaja.toFixed(1)} días</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Punto de equilibrio (7d)</dt>
                  <dd className="text-lg font-semibold text-[#D4AF37]">
                    {formatCurrencyUSD(cashflow.puntoEquilibrio)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Alertas</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {alerts.length ? alerts.map((alert) => <AlertPill key={alert.code} level={alert.level} message={alert.message} />) : (
              <span className="text-sm text-slate-500">Sin alertas para este período.</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
      {message}
    </div>
  );
}
