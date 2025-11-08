// supabase/functions/daily-summary/index.ts
// Resumen diario por sucursal: Ventas, COGS real (Kardex) y Top Items.
// Opcional: envía payload a GHL vía webhook.
// Requiere: INVU_TOKENS_JSON ({"sf":"<token>", "cangrejo":"...", ...})
// Opcional: GHL_WEBHOOK_URL

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TZ = "America/Panama";
const VERSION = "daily-summary@2025-11-08";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROJECT_REF = Deno.env.get("PROJECT_REF") ?? "pktlfjebomjxftszefvp";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? `https://${PROJECT_REF}.supabase.co`;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_KEY") ?? "";
const INVU_TOKENS_JSON = Deno.env.get("INVU_TOKENS_JSON") ?? "{}";
const GHL_WEBHOOK_URL = Deno.env.get("GHL_WEBHOOK_URL") ?? "";

const INVU_BASE = "https://api6.invupos.com/invuApiPos/index.php";

// Endpoints (ajusta si tu tenant usa otros slugs; seguimos el patrón ?r=...):
const EP_TOTALS_BY_DATE = "citas/OrdenesAllTotales";                 // params: fini/{epoch}/ffin/{epoch}/tipo/2
const EP_KARDEX_BY_DATE = "producto/kardexreport";                   // params: fini/{epoch}/ffin/{epoch}
const EP_ITEMS_SOLD_BY_DATE = "citas/TotalesItemsVendidosFechasIni"; // params: fini/{epoch}/ffin/{epoch}

type BranchKey = "sf" | "cangrejo" | "central" | "museo" | "costa";

interface DayRange {
  date: string;      // "YYYY-MM-DD" local TZ
  fini: number;      // epoch start of day (seconds)
  ffin: number;      // epoch end of day (seconds)
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
}

function toEpochSeconds(dateISO: string, endOfDay = false): number {
  // interpret dateISO in Panama TZ
  const base = new Date(new Date(dateISO + "T00:00:00").toLocaleString("en-US", { timeZone: TZ }));
  const t = endOfDay ? new Date(base.getTime() + 24 * 3600 * 1000 - 1000) : base;
  return Math.floor(t.getTime() / 1000);
}

function dayRangeFrom(dateISO?: string): DayRange {
  const d = dateISO && /^\d{4}-\d{2}-\d{2}$/.test(dateISO)
    ? dateISO
    : new Date(new Date().toLocaleString("en-US", { timeZone: TZ })).toISOString().slice(0, 10); // today local
  const fini = toEpochSeconds(d, false);
  const ffin = toEpochSeconds(d, true);
  return { date: d, fini, ffin };
}

async function invuFetch<T = any>(token: string, rPath: string, params: Record<string, string | number> = {}): Promise<T> {
  const search = new URLSearchParams({ r: rPath }).toString();
  let url = `${INVU_BASE}?${search}`;
  // append /fini/..../ffin/.... style segments if present in rPath; or via paramsSegment
  if (params) {
    const seg = Object.entries(params).map(([k, v]) => `${k}/${encodeURIComponent(String(v))}`).join("/");
    if (seg) url += (rPath.includes("?") ? "&" : "&") + ""; // keep simple; segments already in rPath when needed
    // For INVU style endpoints, they want ...?r=foo/bar/fini/{ts}/ffin/{ts}/tipo/2
    url = `${INVU_BASE}?r=${rPath}/${seg}`;
  }
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "ACCEPT": "application/json",
      "AUTHORIZATION": token,     // per INVU docs
    },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // sometimes INVU returns plain text; wrap
    // @ts-ignore
    return { raw: text } as T;
  }
}

async function supabaseRpc(path: string, init?: RequestInit) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase error ${res.status}: ${msg}`);
  }
  return res.json();
}

async function getSalesTotalFromInvu(token: string, range: DayRange): Promise<number> {
  // Use OrdenesAllTotales fini/ffin tipo=2 (por día). Sum "total" or "subtotal" from data.
  const data: any = await invuFetch<any>(token, EP_TOTALS_BY_DATE, { fini: range.fini, ffin: range.ffin, tipo: 2 });
  // Try common shapes
  // { data: [{fecha: "2025-11-08", total: 123.45, subtotal: ..., itbms: ...}, ...] }
  const rows: any[] = data?.data ?? data?.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  // pick same-day row if API returns window aggregates
  const row = rows.find((r) => (r.fecha || r.date || "").startsWith(range.date)) ?? rows[0];
  const val = Number(row?.total ?? row?.subtotal ?? 0);
  return Number.isFinite(val) ? val : 0;
}

async function getCogsFromKardexOrDB(token: string, range: DayRange, branch: BranchKey): Promise<number> {
  // 1) Try Kardex API
  try {
    const kd: any = await invuFetch<any>(token, EP_KARDEX_BY_DATE, { fini: range.fini, ffin: range.ffin });
    // Many tenants return { data: [{ costo_total: number } ...] } OR array of lines with qty & avg_cost
    const arr: any[] = Array.isArray(kd?.data) ? kd.data : Array.isArray(kd) ? kd : [];
    if (arr.length) {
      const sum = arr.reduce((acc, r) => {
        const c = Number(r?.costo_total ?? (r?.avg_cost || r?.costo_promedio) * (r?.cantidad || r?.qty || 0) || 0);
        return acc + (Number.isFinite(c) ? c : 0);
      }, 0);
      if (sum > 0) return Number(sum.toFixed(2));
    }
  } catch (_) {
    // fallthrough to DB
  }

  // 2) Fallback: DB sum(invu_ventas_detalle.costo_unitario * cantidad) for that date & branch sucursal_id
  // We need sucursal_id for branch; we stored it on invu_ventas.sucursal_id with 'branch' column
  const { date } = range;
  const payload = { date, branch };
  const out = await supabaseRpc(`/rest/v1/rpc/cogs_for_day_branch`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch(() => null as any);

  const val = out?.cogs ?? 0;
  return Number(val) || 0;
}

async function getTopItemsFromInvuOrDB(token: string, range: DayRange, branch: BranchKey) {
  // 1) Try ItemsSoldByDate API
  try {
    const items: any = await invuFetch<any>(token, EP_ITEMS_SOLD_BY_DATE, { fini: range.fini, ffin: range.ffin });
    const rows: any[] = items?.data ?? items?.rows ?? [];
    if (Array.isArray(rows) && rows.length) {
      // normalize fields
      const norm = rows.map((r) => {
        const nombre = r?.descripcion ?? r?.producto ?? r?.name ?? "";
        const qty = Number(r?.cantidad ?? r?.qty ?? r?.total_items ?? 0);
        const sales = Number(r?.total ?? r?.ventas ?? r?.monto ?? 0);
        return { nombre, qty, sales };
      }).filter(x => x.qty > 0 || x.sales > 0);
      if (norm.length) {
        // order by sales then qty
        const top = norm.sort((a, b) => (b.sales - a.sales) || (b.qty - a.qty)).slice(0, 3);
        return top;
      }
    }
  } catch (_) {
    // ignore, fallback to DB
  }

  // 2) Fallback: aggregate from invu_ventas_detalle for that day/branch
  const { date } = range;
  const payload = { date, branch };
  const res = await supabaseRpc(`/rest/v1/rpc/top_items_for_day_branch`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch(() => null as any);

  return (res?.items ?? []).slice(0, 3);
}

function buildMessageCard(sucursal: string, dateISO: string, sales: number, cogs: number, top: any[], payments?: any) {
  const margen = sales > 0 ? ((sales - cogs) / sales) * 100 : 0;
  const topLine = top && top.length
    ? top.map((t: any) => `${t.nombre ?? t.producto ?? "Item"} ($${(t.sales ?? 0).toFixed(2)}/${t.qty ?? 0}u)`).join(", ")
    : "Sin datos";
  const payLine = payments
    ? `\n💳 Pagos: ${Object.entries(payments).map(([k, v]: any) => `${k} $${Number(v as number).toFixed(2)}`).join(" | ")}`
    : "";

  return [
    `📊 *Reporte Diario – ${sucursal}*`,
    `🗓️ ${dateISO}`,
    `💰 Ventas: *$${sales.toFixed(2)}*`,
    `📦 COGS: *$${cogs.toFixed(2)}*`,
    `💹 Margen: *${margen.toFixed(1)}%*`,
    `🔥 Top: ${topLine}`,
    payLine,
  ].join("\n");
}

// --- Minimal RPC helpers (create them once in DB) ---
// 1) cogs_for_day_branch(date text, branch text) -> { cogs numeric }
//    SELECT COALESCE(SUM(d.costo_unitario*d.cantidad),0)::numeric AS cogs
//    FROM invu_ventas_detalle d JOIN invu_ventas v ON v.id = d.venta_id
//    WHERE v.branch = branch AND d.fecha = date::date;
//
// 2) top_items_for_day_branch(date text, branch text) -> SETOF (nombre text, qty numeric, sales numeric)
//    SELECT COALESCE(d.producto_nombre, d.producto) AS nombre,
//           SUM(d.cantidad) AS qty,
//           SUM(d.total_linea) AS sales
//    FROM invu_ventas_detalle d JOIN invu_ventas v ON v.id = d.venta_id
//    WHERE v.branch = branch AND d.fecha = date::date
//    GROUP BY 1 ORDER BY sales DESC NULLS LAST, qty DESC;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = new URL(req.url);
    const q = url.searchParams;

    const dateISO = q.get("date") ?? q.get("fecha") ?? undefined;
    const send = (q.get("send") ?? "").toString() === "1";
    const webhook = q.get("webhook") ?? GHL_WEBHOOK_URL || "";
    const branchesParam = (q.get("branches") ?? "sf,cangrejo,central,museo,costa")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean) as BranchKey[];

    const range = dayRangeFrom(dateISO ?? (() => {
      // "ayer" por defecto
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
      const y = new Date(now.getTime() - 24 * 3600 * 1000);
      return y.toISOString().slice(0, 10);
    })());

    const tokenMap = JSON.parse(INVU_TOKENS_JSON || "{}") as Record<string, string>;
    const out: any[] = [];

    for (const b of branchesParam) {
      const token = tokenMap[b];
      if (!token) {
        out.push({ branch: b, error: "MISSING_TOKEN" });
        continue;
      }

      const [sales, cogs, top] = await Promise.all([
        getSalesTotalFromInvu(token, range).catch(() => 0),
        getCogsFromKardexOrDB(token, range, b).catch(() => 0),
        getTopItemsFromInvuOrDB(token, range, b).catch(() => []),
      ]);

      const msg = buildMessageCard(b, range.date, sales, cogs, top);
      const payload = { branch: b, date: range.date, sales, cogs, margin_pct: sales ? ((sales - cogs) / sales) * 100 : 0, top, message: msg };

      // optional push to GHL
      if (send && webhook) {
        await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            event: "daily-summary",
            branch: b,
            date: range.date,
            sales,
            cogs,
            marginPct: payload.margin_pct,
            top,
            message: msg,
          }),
        }).catch(() => null);
      }

      out.push(payload);
    }

    return jsonResponse({ ok: true, version: VERSION, range, branches: branchesParam, results: out });
  } catch (e) {
    return jsonResponse({ ok: false, version: VERSION, error: String(e?.message ?? e) }, 500);
  }
});
