import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, DollarSign, Receipt, Building2, Calendar } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuthOrg } from '../context/AuthOrgContext';
import { KPICard } from '../components/KPICard';
import { RealtimeStatusIndicator } from '../components/RealtimeStatusIndicator';
import { useRealtimeVentas } from '../hooks/useRealtimeVentas';
import { debugLog, getFunctionsBase } from '../utils/diagnostics';

/* ──────────────────────────────────────────────────────────
   Formatos / utilidades
   ────────────────────────────────────────────────────────── */
function todayYMD(tz = 'America/Panama') {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
function formatCurrencyUSD(n: number) {
  return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
function formatDateDDMMYYYY(ymd: string) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
   Tipos de respuesta
// RPC única (agrega por día). Con sucursal_id = null → agrega TODAS.
type RpcSerieRow = {
  d: string;            // 'YYYY-MM-DD'
  ventas_netas: number; // numeric
  itbms: number;        // numeric
  tx: number;           // bigint
};
// Vista por día/sucursal (para ranking cuando “todas”)
type ViewSeriesRow = {
  dia: string;          // 'YYYY-MM-DD'
  sucursal_id: string;  // uuid
  sucursal: string;     // nombre
  ventas_brutas: number;
  itbms: number;
  tickets: number;
  propina: number | null;
type TablaSucursal = { nombre: string; ventas: number; transacciones: number; ticketPromedio: number; };
type SyncBranchStat = { name: string; orders: number; sales?: number };
   Página
export default function VentasPage() {
export default function VentasPage() {
