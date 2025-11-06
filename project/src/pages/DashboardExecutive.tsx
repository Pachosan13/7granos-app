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
  sucursal_id?: string | number | null;
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

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeSucursalParam(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (['all', 'todas', 'toda', 'tod@s', 'null', 'undefined'].includes(lower)) {
    return null;
  }

  return normalized;
}

function safeDateFromInput(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (ISO_DATE_PATTERN.test(trimmed)) {
    const match = ISO_DATE_PATTERN.exec(trimmed);
    if (match) {
      const [, year, month, day] = match;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeRange(range: { desde?: string | null; hasta?: string | null }): { desde: string; hasta: string } {
  const fallback = sevenDayWindow(true);
  const startDate = safeDateFromInput(range.desde) ?? new Date(`${fallback.desde}T00:00:00`);
  const endDate = safeDateFromInput(range.hasta) ?? new Date(`${fallback.hasta}T00:00:00`);
  if (endDate.getTime() < startDate.getTime()) {
    return fallback;
  }
  return { desde: fmt(startDate), hasta: fmt(endDate) };
}

interface DashboardParamsInput {
  desde?: string | null;
  hasta?: string | null;
  sucursalId?: string | number | null;
}

interface DashboardParams {
  desde: string;
  hasta: string;
  sucursal_id: string | null;
}

function normalizeDashboardParams({ desde, hasta, sucursalId }: DashboardParamsInput): DashboardParams {
  const range = normalizeRange({ desde: desde ?? null, hasta: hasta ?? null });
  return {
    ...range,
    sucursal_id: normalizeSucursalParam(sucursalId ?? null),
  };
}

function sanitizeBranchKey(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (!raw) {
    return 'desconocida';
  }
  const lower = raw.toLowerCase();
  if (['sin-id', 'sinid', 'sin - id', 'sin id', 'null', 'undefined'].includes(lower)) {
    return 'desconocida';
  }
  return raw;
}

function sanitizeBranchName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 'Sin sucursal';
  }
  return trimmed;
}

function toNumber(value: NullableNumber): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(/,/g, '');
    const parsed = Number(normalized);
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

interface RpcCallOptions {
  includeSucursalParam?: boolean;
}

async function callDashboardRpc<T>(
  fn: string,
  params: DashboardParams,
  options: RpcCallOptions = {}
): Promise<T | null> {
  const { includeSucursalParam = true } = options;

  const base = { desde: params.desde, hasta: params.hasta } as const;
  const legacyBase = { p_desde: params.desde, p_hasta: params.hasta } as const;

  const variants: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const pushVariant = (variant: Record<string, unknown>) => {
    const cleanedEntries = Object.entries(variant).filter(([, value]) => value !== undefined);
    const cleaned = Object.fromEntries(cleanedEntries);
    const key = JSON.stringify(cleaned);
    if (!seen.has(key) && cleanedEntries.length > 0) {
      variants.push(cleaned);
      seen.add(key);
    }
  };

  if (includeSucursalParam) {
    pushVariant({ ...base, sucursal_id: params.sucursal_id });
    pushVariant({ ...base, p_sucursal_id: params.sucursal_id });
    pushVariant({ ...legacyBase, sucursal_id: params.sucursal_id });
    pushVariant({ ...legacyBase, p_sucursal_id: params.sucursal_id });
  }

  pushVariant(base);
  pushVariant(legacyBase);

  let lastError: PostgrestError | Error | null = null;

  for (let index = 0; index < variants.length; index += 1) {
    const payload = variants[index];
    const { data, error } = await supabase.rpc<T>(fn, payload);
    if (!error) {
      if (index > 0 && import.meta.env.DEV) {
        console.warn(`[dashboard] ${fn} usó firma alternativa #${index + 1}`, payload);
      }
      return data ?? null;
    }

    lastError = error;

    const code = (error as PostgrestError).code;
    const isParamMismatch = code === 'PGRST202' || code === 'PGRST204' || code === 'PGRST302';

    if (!isParamMismatch && !includeSucursalParam) {
      break;
    }
  }

  if (import.meta.env.DEV) {
    console.error(`[dashboard] rpc ${fn} falló`, variants, lastError);
  }

  if (lastError) {
    throw lastError;
  }

  return null;
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

async function fetchSummary(
  desde: string,
  hasta: string,
  sucursalId: string | number | null
): Promise<Summary7d | null> {
  const params = normalizeDashboardParams({ desde, hasta, sucursalId });

  const payload = (await callDashboardRpc<SummaryRowPayload[]>('api_dashboard_summary_7d', params)) ?? [];

  if (!payload.length) {
    return null;
  }

  type SummaryAccumulator = {
    branch: string | null;
    ventas_netas: number;
    cogs: number;
    gastos: number;
    utilidad: number;
    tx: number;
    deltaSum: number;
    deltaWeight: number;
  };

  const byBranch = new Map<string | null, SummaryAccumulator>();

  payload.forEach((row) => {
    const branchKeyRaw = row.sucursal_id ?? null;
    const branchKey = branchKeyRaw === null || branchKeyRaw === undefined ? null : String(branchKeyRaw);
    const target =
      byBranch.get(branchKey) ?? {
        branch: branchKey,
        ventas_netas: 0,
        cogs: 0,
        gastos: 0,
        utilidad: 0,
        tx: 0,
        deltaSum: 0,
        deltaWeight: 0,
      };

    const ventasNetas = toNumber(row.ventas_netas ?? row.ventas ?? row.ventas_brutas);
    const cogs = toNumber(row.cogs ?? row.costo ?? row.costo_ventas);
    const gastos = toNumber(row.gastos ?? row.gasto_total);
    const utilidadBase = row.utilidad ?? row.margen;
    const utilidad =
      utilidadBase !== undefined && utilidadBase !== null ? toNumber(utilidadBase) : ventasNetas - cogs - gastos;
    const tx = toNumber(row.tx ?? row.transacciones);
    const delta = toNullableNumber(
      row.ventas_vs_semana_ant_pct ?? row.delta_ventas_pct ?? row.delta_vs_semana_ant_pct
    );

    target.ventas_netas += ventasNetas;
    target.cogs += cogs;
    target.gastos += gastos;
    target.utilidad += utilidad;
    target.tx += tx;
    if (delta !== null) {
      target.deltaSum += delta * Math.max(ventasNetas, 1);
      target.deltaWeight += Math.max(ventasNetas, 1);
    }

    byBranch.set(branchKey, target);
  });

  const normalizedRows = Array.from(byBranch.values()).map((row) => {
    const ticketPromedio = row.tx > 0 ? row.ventas_netas / row.tx : 0;
    const margenBrutoPct = row.ventas_netas > 0 ? (row.ventas_netas - row.cogs) / row.ventas_netas : 0;
    const deltaPct = row.deltaWeight > 0 ? row.deltaSum / row.deltaWeight : null;

    return {
      branch: row.branch,
      data: {
        ventas_netas: row.ventas_netas,
        cogs: row.cogs,
        gastos: row.gastos,
        utilidad: row.utilidad,
        tx: row.tx,
        ticket_promedio: ticketPromedio,
        margen_bruto_pct: margenBrutoPct,
        ventas_vs_semana_ant_pct: deltaPct,
      } satisfies Summary7d,
    };
  });

  const findByBranch = (branch: string | null) =>
    normalizedRows.find((row) => {
      if (branch === null) {
        return row.branch === null;
      }
      return row.branch === branch;
    })?.data;

  if (params.sucursal_id === null) {
    const allRow = findByBranch(null);
    if (allRow) {
      return allRow;
    }

    const totals = normalizedRows.reduce(
      (acc, row) => {
        acc.ventas_netas += row.data.ventas_netas;
        acc.cogs += row.data.cogs;
        acc.gastos += row.data.gastos;
        acc.utilidad += row.data.utilidad;
        acc.tx += row.data.tx;
        if (row.data.ventas_vs_semana_ant_pct !== null) {
          acc.deltaSum += row.data.ventas_vs_semana_ant_pct * Math.max(row.data.ventas_netas, 1);
          acc.deltaWeight += Math.max(row.data.ventas_netas, 1);
        }
        return acc;
      },
      { ventas_netas: 0, cogs: 0, gastos: 0, utilidad: 0, tx: 0, deltaSum: 0, deltaWeight: 0 }
    );

    const ticketPromedio = totals.tx > 0 ? totals.ventas_netas / totals.tx : 0;
    const margenBrutoPct =
      totals.ventas_netas > 0 ? (totals.ventas_netas - totals.cogs) / totals.ventas_netas : 0;
    const deltaPct = totals.deltaWeight > 0 ? totals.deltaSum / totals.deltaWeight : null;

    return {
      ventas_netas: totals.ventas_netas,
      cogs: totals.cogs,
      gastos: totals.gastos,
      utilidad: totals.utilidad,
      tx: totals.tx,
      ticket_promedio: ticketPromedio,
      margen_bruto_pct: margenBrutoPct,
      ventas_vs_semana_ant_pct: deltaPct,
    } satisfies Summary7d;
  }

  const matchingRow = findByBranch(params.sucursal_id);
  if (matchingRow) {
    return matchingRow;
  }

  const fallbackRow = normalizedRows[0]?.data;
  return fallbackRow ?? null;
}

async function fetchSeries(
  desde: string,
  hasta: string,
  sucursalId: string | number | null
): Promise<SeriesPoint[]> {
  const params = normalizeDashboardParams({ desde, hasta, sucursalId });

  const payload = (await callDashboardRpc<SeriesRowPayload[]>('rpc_ui_series_14d', params)) ?? [];

  const mapped = payload
    .map<SeriesPoint | null>((row) => {
      const dateValue = row.d ?? row.dia ?? null;
      const parsedDate = safeDateFromInput(dateValue ?? undefined);
      if (!parsedDate) {
        return null;
      }
      return {
        d: fmt(parsedDate),
        ventas_netas: toNumber(row.ventas_netas ?? row.ventas),
        itbms: toNullableNumber(row.itbms),
        tx: toNumber(row.tx ?? row.transacciones),
      };
    })
    .filter((row): row is SeriesPoint => Boolean(row));

  const merged = new Map<string, SeriesPoint>();
  mapped.forEach((point) => {
    const existing = merged.get(point.d) ?? { ...point, ventas_netas: 0, tx: 0 };
    existing.ventas_netas += point.ventas_netas;
    existing.tx += point.tx;
    existing.itbms = (existing.itbms ?? 0) + (point.itbms ?? 0);
    merged.set(point.d, existing);
  });

  return Array.from(merged.values()).sort((a, b) => a.d.localeCompare(b.d));
}

async function fetchRanking(
  desde: string,
  hasta: string,
  sucursalId: string | number | null
): Promise<LeaderboardRow[]> {
  const params = normalizeDashboardParams({ desde, hasta, sucursalId });

  const payload = (await callDashboardRpc<RankingRowPayload[]>('api_dashboard_ranking_7d', params)) ?? [];

  interface RankingAccumulator extends LeaderboardRow {
    matchKeys: Set<string>;
  }

  const aggregated = new Map<string, RankingAccumulator>();

  payload.forEach((row) => {
    const rawId = row.sucursal_id ?? null;
    const idKey = sanitizeBranchKey(rawId);
    const nombre = sanitizeBranchName(row.sucursal_nombre);
    const nameKey = sanitizeBranchKey(row.sucursal_nombre ?? null);
    const resolvedKey = idKey !== 'desconocida' ? idKey : nameKey !== 'desconocida' ? nameKey : 'desconocida';

    const existing =
      aggregated.get(resolvedKey) ?? {
        sucursal_id: idKey !== 'desconocida' && rawId !== null ? String(rawId) : resolvedKey,
        sucursal_nombre: nombre,
        ventas: 0,
        cogs: 0,
        gastos: 0,
        utilidad: 0,
        margen_pct: 0,
        matchKeys: new Set<string>(),
      };

    const ventas = toNumber(row.ventas);
    const cogs = toNumber(row.cogs);
    const gastos = toNumber(row.gastos);
    const utilidad = toNumber(row.utilidad);

    existing.ventas += ventas;
    existing.cogs += cogs;
    existing.gastos += gastos;
    existing.utilidad += utilidad;

    if (rawId !== null) {
      existing.matchKeys.add(sanitizeBranchKey(rawId));
      if (existing.sucursal_id === resolvedKey || existing.sucursal_id === 'desconocida') {
        existing.sucursal_id = String(rawId);
      }
    }

    if (row.sucursal_nombre) {
      existing.matchKeys.add(sanitizeBranchKey(row.sucursal_nombre));
    }

    if (!existing.sucursal_nombre || existing.sucursal_nombre === 'Sin sucursal') {
      existing.sucursal_nombre = nombre;
    }

    existing.matchKeys.add(resolvedKey);

    aggregated.set(resolvedKey, existing);
  });

  const aggregatedRows = Array.from(aggregated.values());
  const targetKey = params.sucursal_id !== null ? sanitizeBranchKey(params.sucursal_id) : null;

  const scopedRows =
    targetKey && aggregatedRows.some((row) => row.matchKeys.has(targetKey))
      ? aggregatedRows.filter((row) => row.matchKeys.has(targetKey))
      : aggregatedRows;

  return scopedRows
    .map(({ matchKeys, ...row }) => ({
      ...row,
      margen_pct: row.ventas > 0 ? (row.ventas - row.cogs) / row.ventas : 0,
    }))
    .sort((a, b) => b.ventas - a.ventas);
}

async function fetchTopProducts(
  desde: string,
  hasta: string,
  sucursalId: string | number | null
): Promise<TopProductItem[]> {
  try {
    const params = normalizeDashboardParams({ desde, hasta, sucursalId });
    const payload =
      (await callDashboardRpc<TopProductRowPayload[]>('api_dashboard_top_productos_7d', params)) ?? [];

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

async function fetchHeatmap(
  desde: string,
  hasta: string,
  sucursalId: string | number | null
): Promise<HeatmapPoint[]> {
  try {
    const params = normalizeDashboardParams({ desde, hasta, sucursalId });
    const payload =
      (await callDashboardRpc<HeatmapRowPayload[]>('api_dashboard_heatmap_hora_7d', params)) ?? [];

    const byHour = new Map<number, HeatmapPoint>();

    payload.forEach((row) => {
      const hour = Math.round(toNumber(row.hora));
      if (!Number.isFinite(hour)) {
        return;
      }
      const clampedHour = Math.min(23, Math.max(0, hour));
      const ventas = toNumber(row.ventas);
      const tx = toNumber(row.tx);
      const existing = byHour.get(clampedHour) ?? { hora: clampedHour, ventas: 0, tx: 0 };
      existing.ventas += ventas;
      existing.tx += tx;
      byHour.set(clampedHour, existing);
    });

    return Array.from(byHour.values()).sort((a, b) => a.hora - b.hora);
  } catch (err) {
    console.warn('[dashboard] api_dashboard_heatmap_hora_7d no disponible', err);
    return [];
  }
}

async function fetchAlerts(
  desde: string,
  hasta: string,
  sucursalId: string | number | null
): Promise<AlertItem[]> {
  try {
    const params = normalizeDashboardParams({ desde, hasta, sucursalId });
    const payload =
      (await callDashboardRpc<AlertRowPayload[]>('api_dashboard_alertas_7d', params)) ?? [];

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

async function fetchPlanillaSnapshot(
  desde: string,
  hasta: string,
  sucursalId: string | number | null
): Promise<PlanillaSnapshot | null> {
  try {
    const params = normalizeDashboardParams({ desde, hasta, sucursalId });
    const payload =
      (await callDashboardRpc<PlanillaRowPayload[]>('api_dashboard_planilla_snapshot', params)) ?? [];

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

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
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
  const [range, setRange] = useState(() => normalizeRange(sevenDayWindow(true)));

  const selectedSucursalId = sucursalSeleccionada?.id ?? null;

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
      const primaryRange = normalizeRange(sevenDayWindow(true));
      const chartRange = normalizeRange({
        desde: addDays(primaryRange.desde, -7),
        hasta: primaryRange.hasta,
      });

      const initialSeries = await fetchSeries(chartRange.desde, chartRange.hasta, selectedSucursalId ?? null);
      let effectiveRange = primaryRange;
      let seriesData = initialSeries;
      let fallback = false;

      const lastPoint = initialSeries.at(-1);
      const hasTodayData =
        lastPoint &&
        lastPoint.d === primaryRange.hasta &&
        (Number(lastPoint.ventas_netas) > 0 || Number(lastPoint.tx) > 0);

      if (!hasTodayData) {
        const altRange = normalizeRange(sevenDayWindow(false));
        const altChartRange = normalizeRange({
          desde: addDays(altRange.desde, -7),
          hasta: altRange.hasta,
        });
        seriesData = await fetchSeries(altChartRange.desde, altChartRange.hasta, selectedSucursalId ?? null);
        effectiveRange = altRange;
        fallback = true;
      }

      const [summaryData, rankingData, topData, heatmapData, alertData, planillaData] = await Promise.all([
        fetchSummary(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId ?? null),
        fetchRanking(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId ?? null),
        fetchTopProducts(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId ?? null),
        fetchHeatmap(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId ?? null),
        fetchAlerts(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId ?? null),
        fetchPlanillaSnapshot(effectiveRange.desde, effectiveRange.hasta, selectedSucursalId ?? null),
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
          {error ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </section>

        <section>
          {loading && !summary ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                title="Ventas Netas"
                value={summary?.ventas_netas ?? 0}
                deltaPct={summary?.ventas_vs_semana_ant_pct ?? null}
                tooltip="Comparado con la semana anterior"
              />
              <KpiCard
                title="COGS"
                value={summary?.cogs ?? 0}
                tooltip="Costo de bienes vendidos"
              />
              <KpiCard
                title="Gastos"
                value={summary?.gastos ?? 0}
                tooltip="Planilla + gastos fijos"
              />
              <KpiCard
                title="Utilidad"
                value={summary?.utilidad ?? 0}
                tooltip="Ventas - COGS - Gastos"
                highlight="warning"
              />
              <KpiCard
                title="Ticket Promedio"
                value={summary?.ticket_promedio ?? 0}
                formatter={(value) => formatCurrencyUSD(value)}
                tooltip="Ventas / Transacciones"
              />
              <KpiCard
                title="Margen Bruto %"
                value={summary?.margen_bruto_pct ?? 0}
                formatter={(value) => formatPercent(value)}
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
