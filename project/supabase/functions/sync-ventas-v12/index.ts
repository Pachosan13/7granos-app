// supabase/functions/sync-ventas-v12/index.ts
// 7 Granos — INVU Sync (detalle)
// - mode: "pull_detalle"   => descarga desde INVU (Adv con fallback a legacy)
// - mode: "ingest_detalle" => upsert en invu_ventas

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const N = (x: any, def = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
};

const parseFecha = (v: any): string | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    try {
      const num = Number(s);
      const ms = s.length > 10 ? num : num * 1000;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    } catch { return null; }
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

// ---------- INVU helpers ----------
const invuAdvUrl = (start: number, end: number, tipo = 1) =>
  `https://api6.invupos.com/invuApiPos/index.php?r=citas/ordenesAllAdv/fini/${start}/ffin/${end}/tipo/${tipo}`;

const invuLegacyUrl = (start: number, end: number, tipo = 1) =>
  `https://api6.invupos.com/invuApiPos/index.php?r=citas/ordenesAll/fini/${start}/ffin/${end}/tipo/${tipo}`;

// INVU a veces devuelve HTTP 200 con {status:403} / {error:true} / "Parametros incorrectos".
async function invuFetchRaw(url: string, token: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", AUTHORIZATION: token }, // SIN "Bearer"
  });
  const text = await res.text();
  console.log(`[INVU] ${res.status} ${url} :: ${text.slice(0, 250)}`);

  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch {}

  const logicalError =
    json?.status == 403 ||
    json?.error === true ||
    json?.message === "Parametros incorrectos";

  return { ok: res.ok && !logicalError, status: res.status, body: json, raw: text };
}

async function invuFetchDetalle(start: number, end: number, token: string, tipo = 1) {
  const adv = await invuFetchRaw(invuAdvUrl(start, end, tipo), token);
  if (adv.ok) return adv.body;

  const legacy = await invuFetchRaw(invuLegacyUrl(start, end, tipo), token);
  if (legacy.ok) return legacy.body;

  throw new Error(
    `INVU failed (adv:${adv.status}/${adv.body?.status || ""}, legacy:${legacy.status}/${legacy.body?.status || ""})`
  );
}

// ---------- HTTP helper ----------
function j(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { mode = "pull_detalle", sucursal, start_ts, end_ts, tipo = 1 } = body;

    // Credenciales Supabase (alias SERVICE_* para evitar bloqueo CLI)
    const supaUrl = Deno.env.get("SERVICE_URL") || Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !serviceKey) return j(500, { ok: false, error: "Faltan SERVICE_URL / SERVICE_ROLE_KEY" });
    const supabase = createClient(supaUrl, serviceKey);

    if (mode === "pull_detalle") {
      if (!sucursal || !start_ts || !end_ts)
        return j(400, { ok: false, error: "Faltan parámetros: sucursal, start_ts, end_ts" });

      const token = body.token || getTokenPorSucursal(sucursal);
      if (!token) return j(400, { ok: false, error: "Token no encontrado para la sucursal" });

      const start = Number(start_ts), end = Number(end_ts);
      if (!Number.isFinite(start) || !Number.isFinite(end))
        return j(400, { ok: false, error: "start_ts/end_ts deben ser epoch (segundos)" });

      const data = await invuFetchDetalle(start, end, token, Number(tipo) || 1);
      const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      return j(200, { ok: true, kind: "detalle", count: rows.length, data });
    }

    if (mode === "ingest_detalle") {
      const root = body?.data ?? {};
      const rows =
        Array.isArray(root?.data?.data) ? root.data.data :
        Array.isArray(root?.data)       ? root.data :
        Array.isArray(root)             ? root :
        [];

      if (!rows.length) return j(200, { ok: true, upserted: 0, reason: "payload vacío" });

      const branch = String(body?.sucursal ?? "").toLowerCase();

      const mapped = rows.map((r: any) => ({
        fecha:       parseFecha(r.fecha_cierre_date ?? r.fecha_creacion ?? r.fecha_apertura_date),
        subtotal:    N(r.subtotal ?? r.totales?.subtotal),
        itbms:       N(r.tax ?? r.totales?.tax),
        total:       N(r.total ?? r.totales?.total ?? r.total_pagar),
        propina:     N(r.propina ?? r.totales?.propina),
        num_items:   Array.isArray(r.items) ? r.items.length :
                     Array.isArray(r.detalle) ? r.detalle.length : null,
        sucursal_id: null,
        branch,
        invu_id:     String(r.num_orden ?? r.numero_factura ?? r.id_ord ?? r.id ?? crypto.randomUUID()),
        raw:         r,
        num_transacciones: 1,
        estado:      r.pagada ?? r.status ?? null,
      }));

      // Upsert + conteo exacto
      const { error } = await supabase
        .from("invu_ventas")
        .upsert(mapped, { onConflict: "branch,invu_id", ignoreDuplicates: false });

      if (error) return j(500, { ok: false, upserted: 0, error: error.message || String(error) });

      // cuenta exacta (head) de las filas afectadas
      const { count, error: countErr } = await supabase
        .from("invu_ventas")
        .select("invu_id", { count: "exact", head: true })
        .eq("branch", branch)
        .in("invu_id", mapped.map((m) => m.invu_id));

      if (countErr) console.log("[ingest] count warn:", countErr.message);

      return j(200, { ok: true, upserted: count ?? mapped.length, received: rows.length, mapped: mapped.length });
    }

    return j(400, { ok: false, error: "Modo inválido. Usa: pull_detalle | ingest_detalle" });
  } catch (e) {
    console.error("sync-ventas-v12 error:", e);
    return j(500, { ok: false, error: String(e) });
  }
});
