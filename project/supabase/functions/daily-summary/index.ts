// supabase/functions/daily-summary/index.ts
// Resumen diario por sucursal usando la MISMA vista del dashboard:
//   vw_dashboard_kpis_diarios  (ventas, cogs, margen_bruto)
// Opcional: envía un webhook (GHL) si mandas ?send=1.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TZ      = "America/Panama";
const VERSION = "daily-summary@2025-11-08b";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin":      "*",
  "Access-Control-Allow-Methods":     "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":     "authorization, x-client-info, apikey, content-type",
};

const PROJECT_REF  = Deno.env.get("PROJECT_REF")  ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? (PROJECT_REF ? `https://${PROJECT_REF}.supabase.co` : "");
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_KEY") ?? "";
const GHL_WEBHOOK_URL = Deno.env.get("GHL_WEBHOOK_URL") ?? "";

// Helpers ─────────────────────────────────────────────────────────────────────
function parseDateParam(q: URLSearchParams, name: string, fallback: string): string {
  const v = (q.get(name) ?? "").trim();
  return v || fallback;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
    ...init,
  });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Supabase client (fetch-based; no Node libs) ─────────────────────────────────
function sbClient(jwt: string) {
  return {
    from(table: string) {
      let url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
      let hdrs: Record<string,string> = {
        "apikey": jwt,
        "Authorization": `Bearer ${jwt}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "return=representation",
      };
      const ops = {
        select(cols = "*") {
          url.searchParams.set("select", cols);
          return ops;
        },
        gte(col: string, val: string) { url.searchParams.set(`${col}.gte`, val); return ops; },
        lte(col: string, val: string) { url.searchParams.set(`${col}.lte`, val); return ops; },
        eq(col: string, val: string)  { url.searchParams.set(`${col}.eq`,  val); return ops; },
        async then(onfulfilled: any, onrejected?: any) {
          try {
            const res = await fetch(url.toString(), { headers: hdrs });
            const data = await res.json();
            if (!res.ok) return onrejected?.(data) ?? Promise.reject(data);
            return onfulfilled?.({ data, error: null }) ?? { data, error: null };
          } catch (e) {
            return onrejected?.(e) ?? Promise.reject(e);
          }
        },
        async exec() {
          const res = await fetch(url.toString(), { headers: hdrs });
          const data = await res.json();
          if (!res.ok) return { data: null, error: data };
          return { data, error: null };
        }
      };
      return ops;
    }
  };
}

// Core ────────────────────────────────────────────────────────────────────────
async function fetchKpisDesdeDB(desde: string, hasta: string, sucursalId?: string) {
  const sb = sbClient(SERVICE_KEY);
  let q = sb.from("vw_dashboard_kpis_diarios")
            .select("sucursal_id,fecha,ventas,cogs,margen_bruto")
            .gte("fecha", desde)
            .lte("fecha", hasta);
  if (sucursalId) q = q.eq("sucursal_id", sucursalId);

  const { data, error } = await q.exec();
  if (error) throw error;

  type Row = { sucursal_id: string; fecha: string; ventas: number; cogs: number; margen_bruto: number; };
  const rows: Row[] = Array.isArray(data) ? data : [];

  const agg = new Map<string, { ventas:number; cogs:number; margen:number }>();
  let Tventas = 0, Tcogs = 0, Tmargen = 0;

  for (const r of rows) {
    const key = r.sucursal_id;
    const cur = agg.get(key) ?? { ventas: 0, cogs: 0, margen: 0 };
    cur.ventas += Number(r.ventas || 0);
    cur.cogs   += Number(r.cogs   || 0);
    cur.margen += Number(r.margen_bruto || 0);
    agg.set(key, cur);

    Tventas += Number(r.ventas || 0);
    Tcogs   += Number(r.cogs   || 0);
    Tmargen += Number(r.margen_bruto || 0);
  }

  const porSucursal = [...agg.entries()].map(([sucursal_id, v]) => ({
    sucursal_id,
    ventas: round2(v.ventas),
    cogs: round2(v.cogs),
    margen_bruto: round2(v.margen),
    margen_pct: v.ventas > 0 ? round2((v.margen * 100) / v.ventas) : 0,
  }));

  const totales = {
    ventas: round2(Tventas),
    cogs: round2(Tcogs),
    margen_bruto: round2(Tmargen),
    margen_pct: Tventas > 0 ? round2((Tmargen * 100) / Tventas) : 0,
  };

  return { porSucursal, totales };
}

function mensajeSucursal(d: {fecha: string; ventas: number; cogs: number; margen_bruto: number; margen_pct: number;}, alias: string) {
  const f = d.fecha ?? "";
  return `📊 *Reporte Diario – ${alias}*\n📅 ${f}\n💰 Ventas: *$${d.ventas.toFixed(2)}*\n📦 COGS: *$${d.cogs.toFixed(2)}*\n✅ Margen: *${d.margen_pct.toFixed(2)}%*`;
}

// Handler ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = new URL(req.url);
    const q   = url.searchParams;

    // rango (YYYY-MM-DD)
    const hoy    = new Date().toISOString().slice(0,10);
    const desde  = parseDateParam(q, "desde", hoy);
    const hasta  = parseDateParam(q, "hasta", hoy);
    const sucId  = q.get("sucursal_id") ?? undefined;
    const send   = (q.get("send") ?? "0") === "1";
    const webhook = (q.get("webhook") ?? (GHL_WEBHOOK_URL || ""));

    const { porSucursal, totales } = await fetchKpisDesdeDB(desde, hasta, sucId);

    const results = porSucursal.map(s => ({
      sucursal_id: s.sucursal_id,
      date: hasta,
      sales: s.ventas,
      cogs: s.cogs,
      margin: s.margen_bruto,
      margin_pct: s.margen_pct,
      message: mensajeSucursal({ fecha: hasta, ventas: s.ventas, cogs: s.cogs, margen_bruto: s.margen_bruto, margen_pct: s.margen_pct }, s.sucursal_id)
    }));

    if (send && webhook) {
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "daily-summary", desde, hasta, results, totales, version: VERSION })
        });
      } catch { /* noop */ }
    }

    return jsonResponse({
      ok: true,
      tz: TZ,
      version: VERSION,
      range: { desde, hasta },
      results,
      totals: totales,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err), version: VERSION }, { status: 500 });
  }
});
