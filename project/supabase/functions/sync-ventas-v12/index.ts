// supabase/functions/sync-ventas-v12/index.ts
// 7 Granos — INVU Sync (detalle + orquestador)
// Modos soportados:
//  - "pull_detalle":   baja de INVU (requiere {sucursal,start_ts,end_ts})
//  - "ingest_detalle": inserta/upserta payload ya bajado ({sucursal,data})
//  - "pull_ingest_range_all": calcula ventana (o usa provided) y hace pull+ingest para TODAS las sucursales

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ───────────────────────────────────────────────────────────
// Utils
// ───────────────────────────────────────────────────────────
const TZ = "America/Panama";
const BRANCHES = ["cangrejo", "costa", "sf", "museo"] as const;
type Branch = typeof BRANCHES[number];

const N = (x: any, def = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
};

const parseFecha = (v: any): string | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const num = Number(s);
    const ms = s.length > 10 ? num : num * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return s.slice(0, 10);
};

function getTokenPorSucursal(branch?: string) {
  switch ((branch || "").toLowerCase()) {
    case "cangrejo": return Deno.env.get("CANGREJO_TOKEN") || undefined;
    case "costa":    return Deno.env.get("COSTA_TOKEN") || undefined;
    case "central":  return Deno.env.get("CENTRAL_TOKEN") || undefined;
    case "sf":       return Deno.env.get("SF_TOKEN") || undefined;
    case "museo":    return Deno.env.get("MUSEO_TOKEN") || undefined;
    default:         return undefined;
  }
}

function invuUrlDetalle(start: number, end: number) {
  // API detalle por rango (cerradas) — tipo 1
  const u = new URL("https://api6.invupos.com/invuApiPos/index.php");
  u.searchParams.set("r", `citas/ordenesAllAdv/fini/${start}/ffin/${end}/tipo/1`);
  return u.toString();
}

async function invuFetch(url: string, token: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", AUTHORIZATION: token },
  });
  const text = await res.text();
  console.log(`[INVU] ${res.status} ${url} :: ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`INVU ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { data: [] }; }
}

function j(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Epoch segundos para “YYYY-MM-DD 00:00:00” en TZ Panamá (sin DST)
function epochLocalMidnight(ymd: string): number {
  // Panamá UTC-05 fijo
  return Math.floor(new Date(`${ymd}T00:00:00-05:00`).getTime() / 1000);
}

// Ventana de AYER local (start inclusive, end exclusive)
function yesterdayWindow() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const todayYMD = `${y}-${m}-${d}`;
  const end = epochLocalMidnight(todayYMD);
  const start = end - 24 * 60 * 60;
  return { start, end };
}

// Mapea un registro INVU -> invu_ventas
function mapRow(r: any, branch: string) {
  return {
    fecha:       parseFecha(r.fecha_cierre_date ?? r.fecha_creacion ?? r.fecha_apertura_date),
    subtotal:    N(r.subtotal ?? r.totales?.subtotal),
    itbms:       N(r.tax ?? r.totales?.tax),
    total:       N(r.total ?? r.totales?.total ?? r.total_pagar),
    propina:     N(r.propina ?? r.totales?.propina),
    num_items:   Array.isArray(r.items) ? r.items.length : Array.isArray(r.detalle) ? r.detalle.length : null,
    sucursal_id: null,
    branch:      String(branch),
    invu_id:     String(r.num_orden ?? r.numero_factura ?? r.id_ord ?? r.id ?? crypto.randomUUID()),
    raw:         r,
    num_transacciones: 1,
    estado:      r.pagada ?? r.status ?? null,
  };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { mode = "pull_detalle" } = body;

    const supaUrl =
      Deno.env.get("SERVICE_URL") || Deno.env.get("SUPABASE_URL");
    const serviceKey =
      Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !serviceKey) {
      return j(500, { ok: false, error: "Faltan SERVICE_URL / SERVICE_ROLE_KEY" });
    }
    const supabase = createClient(supaUrl, serviceKey);

    // ─────────────────────────────────────────
    // 1) PULL (detalle crudo)
    // ─────────────────────────────────────────
    if (mode === "pull_detalle") {
      const { sucursal, start_ts, end_ts, desde, hasta } = body;

      let start = Number(start_ts);
      let end = Number(end_ts);
      if ((!start || !end) && desde && hasta) {
        // Permitir fechas YYYY-MM-DD
        start = epochLocalMidnight(String(desde));
        end   = epochLocalMidnight(String(hasta)); // end exclusive si es “día siguiente”
      }
      if (!sucursal || !start || !end) {
        return j(400, { ok: false, error: "Faltan parámetros: sucursal y start_ts/end_ts (o desde/hasta)" });
      }
      const token = body.token || getTokenPorSucursal(sucursal);
      if (!token) return j(400, { ok: false, error: "Token no encontrado para la sucursal" });

      const url = invuUrlDetalle(start, end);
      const data = await invuFetch(url, token);
      const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      return j(200, { ok: true, kind: "detalle", count: rows.length, data });
    }

    // ─────────────────────────────────────────
    // 2) INGEST
    // ─────────────────────────────────────────
    if (mode === "ingest_detalle") {
      const branch = String(body?.sucursal ?? "").toLowerCase();
      const root = body?.data ?? {};
      const rows =
        Array.isArray(root?.data?.data) ? root.data.data
        : Array.isArray(root?.data)     ? root.data
        : Array.isArray(root)           ? root
        : [];
      if (!rows.length) return j(200, { ok: true, upserted: 0, reason: "payload vacío" });

      const mapped = rows.map((r: any) => mapRow(r, branch));
      const { error } = await supabase.from("invu_ventas").upsert(mapped, { onConflict: "branch,invu_id" });
      if (error) return j(500, { ok: false, error: error.message || String(error) });
      return j(200, { ok: true, upserted: mapped.length });
    }

    // ─────────────────────────────────────────
    // 3) ORQUESTADOR: pull + ingest para TODAS
    //     - si no pasan start_ts/end_ts ni desde/hasta → AYER local (Panamá), end exclusive
    // ─────────────────────────────────────────
    if (mode === "pull_ingest_range_all") {
      let { start_ts, end_ts, desde, hasta } = body as any;

      let start = Number(start_ts);
      let end = Number(end_ts);

      if ((!start || !end) && desde && hasta) {
        start = epochLocalMidnight(String(desde));
        end   = epochLocalMidnight(String(hasta));
      }
      if (!start || !end) {
        const win = yesterdayWindow();
        start = win.start;
        end   = win.end;
      }

      const summary: Record<string, {pulled:number, upserted:number, error?:string}> = {};
      for (const b of BRANCHES) {
        try {
          const token = getTokenPorSucursal(b);
          if (!token) {
            summary[b] = { pulled: 0, upserted: 0, error: "Sin token" };
            continue;
          }
          const url = invuUrlDetalle(start, end);
          const data = await invuFetch(url, token);
          const rawRows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
          const mapped = rawRows.map((r: any) => mapRow(r, b));

          const { error } = await supabase.from("invu_ventas").upsert(mapped, { onConflict: "branch,invu_id" });
          if (error) {
            summary[b] = { pulled: rawRows.length, upserted: 0, error: String(error.message || error) };
          } else {
            summary[b] = { pulled: rawRows.length, upserted: mapped.length };
          }
        } catch (e: any) {
          summary[b] = { pulled: 0, upserted: 0, error: String(e?.message || e) };
        }
      }
      return j(200, { ok: true, mode, start, end, summary });
    }

    return j(400, { ok: false, error: "Modo inválido. Usa: pull_detalle | ingest_detalle | pull_ingest_range_all" });
  } catch (e) {
    console.error("sync-ventas-v12 error:", e);
    return j(500, { ok: false, error: String(e) });
  }
});
