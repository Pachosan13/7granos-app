import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { preflight, withCors } from "./cors.ts";

type BranchKey = "sf" | "cangrejo" | "costa" | "museo" | "central";

type NormalizedVenta = {
  fecha: string;
  sucursal_id: string;
  total: number;
  cogs: number;
  tickets: number;
  lineas: number;
};

type BranchSummary = {
  branch: BranchKey;
  sucursal_id: string;
  ok: boolean;
  error?: string;
  dias: number;
  registros: number;
  raw_registros: number;
  total: number;
  cogs: number;
  tickets: number;
  lineas: number;
  source?: string;
};

const BRANCHES: Array<{ key: BranchKey; tokenEnv: string }> = [
  { key: "sf", tokenEnv: "SF_TOKEN" },
  { key: "cangrejo", tokenEnv: "CANGREJO_TOKEN" },
  { key: "costa", tokenEnv: "COSTA_TOKEN" },
  { key: "museo", tokenEnv: "MUSEO_TOKEN" },
  { key: "central", tokenEnv: "CENTRAL_TOKEN" },
];

const PANAMA_TZ = "America/Panama";
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const todayPanama = () => {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: PANAMA_TZ }));
  return now.toISOString().slice(0, 10);
};

const shiftDate = (ymd: string, delta: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

const literalToDate = (value: string | null, fallback: string) => {
  if (!value) return fallback;
  const lower = value.toLowerCase();
  if (lower === "hoy" || lower === "today") return fallback;
  if (lower === "ayer" || lower === "yesterday") return shiftDate(fallback, -1);
  return value;
};

const isValidYmd = (value: string): boolean => {
  if (!DATE_REGEX.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m ?? 1) - 1 && dt.getUTCDate() === d;
};

const ymdToEpochPanama = (ymd: string, endOfDay = false) => {
  const suffix = endOfDay ? "T23:59:59-05:00" : "T00:00:00-05:00";
  const iso = `${ymd}${suffix}`;
  return Math.floor(new Date(iso).getTime() / 1000);
};

const safeNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeDate = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (DATE_REGEX.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(ms);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return null;
};

const extractOrders = (raw: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const candidates = ["data", "ordenes", "orders", "ventas", "items", "result"];
    for (const key of candidates) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value as Array<Record<string, unknown>>;
      }
    }
  }
  return [];
};

const linesCount = (order: Record<string, unknown>): number => {
  if (Array.isArray(order.detalle)) return order.detalle.length;
  if (Array.isArray(order.items)) return order.items.length;
  if (Array.isArray(order.lineas)) return order.lineas.length;
  return safeNumber(order.lineas ?? order.num_items ?? order.items_count ?? order.line_count, 0);
};

const ticketCount = (order: Record<string, unknown>): number => {
  const trusted = safeNumber(order.tickets ?? order.transacciones ?? order.ticket_count ?? order.numero_ticket, NaN);
  if (Number.isFinite(trusted) && trusted > 0) return trusted;
  return 1;
};

const totalAmount = (order: Record<string, unknown>): number => {
  const fields = [
    "total",
    "total_bruto",
    "total_bruto_general",
    "grand_total",
    "monto_total",
    "venta_total",
    "importe",
  ];
  for (const key of fields) {
    const value = order[key];
    if (value != null) {
      const num = safeNumber(value, NaN);
      if (Number.isFinite(num)) return num;
    }
  }
  const subtotal = safeNumber(order.subtotal ?? order.monto ?? order.total_neto, 0);
  const impuesto = safeNumber(order.itbms ?? order.iva ?? order.impuesto ?? order.total_impuestos, 0);
  return subtotal + impuesto;
};

const cogsAmount = (order: Record<string, unknown>): number => {
  const fields = ["cogs", "costo", "total_costo", "costo_total", "costo_bruto"];
  for (const key of fields) {
    const value = order[key];
    if (value != null) {
      const num = safeNumber(value, NaN);
      if (Number.isFinite(num)) return num;
    }
  }
  return 0;
};

const firstDate = (order: Record<string, unknown>): string | null => {
  const candidates = [
    order.fecha,
    order.dia,
    order.fecha_creacion,
    order.created_at,
    order.fecha_registro,
    order.fecha_orden,
    order.fecha_ticket,
    order.fecha_inicio,
    order.start_date,
    order.fecha_fin,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeDate(candidate);
    if (normalized) return normalized;
  }
  return null;
};

const normalizeBranchSales = (branch: BranchKey, raw: unknown): { rows: NormalizedVenta[]; summary: BranchSummary } => {
  const sucursal_id = branch;
  const orders = extractOrders(raw);
  const aggregate = new Map<string, { total: number; cogs: number; tickets: number; lineas: number }>();
  let rawCount = 0;

  for (const order of orders) {
    rawCount += 1;
    const date = firstDate(order);
    if (!date) continue;
    const total = totalAmount(order);
    const cogs = cogsAmount(order);
    const tickets = ticketCount(order);
    const lineas = linesCount(order);

    const bucket = aggregate.get(date) ?? { total: 0, cogs: 0, tickets: 0, lineas: 0 };
    bucket.total += total;
    bucket.cogs += cogs;
    bucket.tickets += tickets;
    bucket.lineas += lineas;
    aggregate.set(date, bucket);
  }

  const rows: NormalizedVenta[] = [];
  let sumTotal = 0;
  let sumCogs = 0;
  let sumTickets = 0;
  let sumLineas = 0;

  for (const [fecha, metrics] of aggregate.entries()) {
    const rounded = {
      total: Math.round(metrics.total * 100) / 100,
      cogs: Math.round(metrics.cogs * 100) / 100,
      tickets: Math.round(metrics.tickets),
      lineas: Math.round(metrics.lineas),
    };
    rows.push({
      fecha,
      sucursal_id,
      total: rounded.total,
      cogs: rounded.cogs,
      tickets: rounded.tickets,
      lineas: rounded.lineas,
    });
    sumTotal += rounded.total;
    sumCogs += rounded.cogs;
    sumTickets += rounded.tickets;
    sumLineas += rounded.lineas;
  }

  rows.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    rows,
    summary: {
      branch,
      sucursal_id,
      ok: true,
      dias: rows.length,
      registros: rows.length,
      raw_registros: rawCount,
      total: Math.round(sumTotal * 100) / 100,
      cogs: Math.round(sumCogs * 100) / 100,
      tickets: sumTickets,
      lineas: sumLineas,
    },
  };
};

const buildSalesUrl = (fini: number, ffin: number): string => {
  const base = (Deno.env.get("INVU_SALES_BASE_URL") ?? "https://api6.invupos.com/invuApiPos").replace(/\/+$/, "");
  const template = (Deno.env.get("INVU_SALES_PATH") ?? "index.php?r=citas/ordenesAllAdv/fini/{F_INI}/ffin/{F_FIN}/tipo/all")
    .replace("{F_INI}", String(fini))
    .replace("{F_FIN}", String(ffin));
  return `${base}/${template.replace(/^\/+/, "")}`;
};

const SALES_TIMEOUT = Number(Deno.env.get("INVU_SALES_TIMEOUT_MS") ?? "20000");

export const handleSyncVentasDetalle = async (req: Request): Promise<Response> => {
  const preflightResponse = preflight(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== "POST") {
    return withCors({ error: "Método no permitido. Usa POST." }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return withCors({ error: "SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados." }, { status: 500 });
  }

  const today = todayPanama();
  const url = new URL(req.url);
  const desdeRaw = literalToDate(url.searchParams.get("desde"), today);
  const hastaRaw = literalToDate(url.searchParams.get("hasta"), desdeRaw);

  if (!desdeRaw || !isValidYmd(desdeRaw)) {
    return withCors({ error: "Parámetro 'desde' inválido. Usa YYYY-MM-DD o literales hoy/ayer." }, { status: 400 });
  }
  if (!hastaRaw || !isValidYmd(hastaRaw)) {
    return withCors({ error: "Parámetro 'hasta' inválido. Usa YYYY-MM-DD o literales hoy/ayer." }, { status: 400 });
  }
  if (desdeRaw > hastaRaw) {
    return withCors({ error: "'desde' debe ser menor o igual a 'hasta'." }, { status: 400 });
  }

  const fini = ymdToEpochPanama(desdeRaw, false);
  const ffin = ymdToEpochPanama(hastaRaw, true);

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    global: { headers: { "x-client-info": "sync-ventas-detalle" } },
  });

  const records: NormalizedVenta[] = [];
  const branches: BranchSummary[] = [];
  const errors: BranchSummary[] = [];
  const salesUrl = buildSalesUrl(fini, ffin);

  for (const branch of BRANCHES) {
    const token = Deno.env.get(branch.tokenEnv);
    if (!token) {
      const summary: BranchSummary = {
        branch: branch.key,
        sucursal_id: branch.key,
        ok: false,
        dias: 0,
        registros: 0,
        raw_registros: 0,
        total: 0,
        cogs: 0,
        tickets: 0,
        lineas: 0,
        error: `Secret ${branch.tokenEnv} no configurado`,
        source: salesUrl,
      };
      branches.push(summary);
      errors.push(summary);
      continue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SALES_TIMEOUT);

    try {
      const response = await fetch(salesUrl, {
        method: "GET",
        headers: {
          "Authorization": token,
          "Accept": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) {
        const summary: BranchSummary = {
          branch: branch.key,
          sucursal_id: branch.key,
          ok: false,
          dias: 0,
          registros: 0,
          raw_registros: 0,
          total: 0,
          cogs: 0,
          tickets: 0,
          lineas: 0,
          error: `INVU rechazó el token (${response.status}).`,
          source: salesUrl,
        };
        branches.push(summary);
        errors.push(summary);
        continue;
      }

      if (!response.ok) {
        const summary: BranchSummary = {
          branch: branch.key,
          sucursal_id: branch.key,
          ok: false,
          dias: 0,
          registros: 0,
          raw_registros: 0,
          total: 0,
          cogs: 0,
          tickets: 0,
          lineas: 0,
          error: `INVU ${response.status}: ${text.slice(0, 200) || "respuesta vacía"}`,
          source: salesUrl,
        };
        branches.push(summary);
        errors.push(summary);
        continue;
      }

      if (!text) {
        const summary: BranchSummary = {
          branch: branch.key,
          sucursal_id: branch.key,
          ok: true,
          dias: 0,
          registros: 0,
          raw_registros: 0,
          total: 0,
          cogs: 0,
          tickets: 0,
          lineas: 0,
          source: salesUrl,
        };
        branches.push(summary);
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        const summary: BranchSummary = {
          branch: branch.key,
          sucursal_id: branch.key,
          ok: false,
          dias: 0,
          registros: 0,
          raw_registros: 0,
          total: 0,
          cogs: 0,
          tickets: 0,
          lineas: 0,
          error: "Respuesta de INVU no es JSON.",
          source: salesUrl,
        };
        branches.push(summary);
        errors.push(summary);
        continue;
      }

      const { rows, summary } = normalizeBranchSales(branch.key, parsed);
      summary.source = salesUrl;
      branches.push(summary);
      records.push(...rows);
    } catch (err) {
      clearTimeout(timer);
      const summary: BranchSummary = {
        branch: branch.key,
        sucursal_id: branch.key,
        ok: false,
        dias: 0,
        registros: 0,
        raw_registros: 0,
        total: 0,
        cogs: 0,
        tickets: 0,
        lineas: 0,
        error: err instanceof DOMException && err.name === "AbortError"
          ? `Timeout tras ${SALES_TIMEOUT}ms consultando INVU.`
          : `Error consultando INVU: ${String(err?.message ?? err)}`,
        source: salesUrl,
      };
      branches.push(summary);
      errors.push(summary);
    }
  }

  let inserted = 0;
  if (records.length > 0) {
    const { data, error } = await supabaseAdmin
      .from<NormalizedVenta>("invu_ventas_detalle")
      .upsert(records, { onConflict: "fecha,sucursal_id" })
      .select("fecha,sucursal_id");

    if (error) {
      return withCors({ error: `Error guardando invu_ventas_detalle: ${error.message}` }, { status: 500 });
    }

    inserted = data?.length ?? records.length;
  }

  const ok = errors.length === 0;
  const status = ok ? 200 : errors.length === branches.length ? 502 : 207;

  return withCors(
    {
      ok,
      inserted,
      branches,
      from: desdeRaw,
      to: hastaRaw,
      fini,
      ffin,
      fetched_at: new Date().toISOString(),
      notes: errors.length ? "Algunas sucursales fallaron, revisa 'branches'." : undefined,
    },
    { status },
  );
};
