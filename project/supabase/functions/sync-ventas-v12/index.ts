// supabase/functions/sync-ventas-v12/index.ts
// 7 Granos — INVU Sync (detalle): pull desde INVU + ingest a invu_ventas
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "v12-2025-11-11c";

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

// ---------- INVU helpers ----------
const invuAdvUrl = (start: number, end: number, tipo = 1) =>
  `https://api6.invupos.com/invuApiPos/index.php?r=citas/ordenesAllAdv/fini/${start}/ffin/${end}/tipo/${tipo}`;

const invuLegacyUrl = (start: number, end: number, tipo = 1) =>
  `https://api6.invupos.com/invuApiPos/index.php?r=citas/ordenesAll/fini/${start}/ffin/${end}/tipo/${tipo}`;

// INVU a veces responde 200 con {status:403} o {error:true}. Normalizamos.
async function invuFetchRaw(url: string, token: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", AUTHORIZATION: token }, // sin Bearer
  });
  const text = await res.text();
  console.log(`[INVU] ${res.status} ${url} :: ${text.slice(0, 250)}`);
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch {}
  const logicalError =
    json?.status == 403 || json?.error === true || json?.message === "Parametros incorrectos";
  return { ok: res.ok && !logicalError, status: res.status, body: json, raw: text };
}

async function invuFetchDetalle(start: number, end: number, token: string, tipo = 1) {
  const a = await invuFetchRaw(invuAdvUrl(start, end, tipo), token);
  if (a.ok) return a.body;
  const l = await invuFetchRaw(invuLegacyUrl(start, end, tipo), token);
  if (l.ok) return l.body;
  throw new Error(`INVU fail adv(${a.status})/legacy(${l.status})`);
}

// ---------- HTTP ----------
const j = (status: number, body: any) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" }});

// ---------- Handler ----------
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { mode = "pull_detalle", sucursal, start_ts, end_ts, tipo = 1 } = body;

    // Evita SUPABASE_* bloqueados en CLI
    const supaUrl = Deno.env.get("SERVICE_URL") || Deno.env.get("SUPABASE_URL");
    const serviceKey =
      Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !serviceKey) return j(500, { ok: false, error: "Faltan SERVICE_URL / SERVICE_ROLE_KEY" });

    const supabase = createClient(supaUrl, serviceKey);

    // -------- DIAGNÓSTICO --------
    if (mode === "diag") {
      const { data: cols, error: colErr } = await supabase
        .from("information_schema.columns")
        .select("column_name")
        .eq("table_schema", "public")
        .eq("table_name", "invu_ventas");

      const { data: sample, error: selErr } = await supabase
        .from("invu_ventas")
        .select("id,branch,invu_id,fecha,total")
        .limit(1);

      return j(200, {
        ok: true,
        version: VERSION,
        envProbe: {
          hasUrl: !!supaUrl, hasKey: !!serviceKey,
        },
        schemaCols: cols?.map((r: any) => r.column_name),
        diagErrors: { colErr: colErr?.message || null, selErr: selErr?.message || null },
        sample,
      });
    }

    // -------- PULL --------
    if (mode === "pull_detalle") {
      if (!sucursal || !start_ts || !end_ts)
        return j(400, { ok: false, error: "Faltan parámetros: sucursal, start_ts, end_ts" });

      const token = body.token || getTokenPorSucursal(sucursal);
      if (!token) return j(400, { ok: false, error: "Token no encontrado para la sucursal" });

      const start = Number(start_ts), end = Number(end_ts);
      if (!Number.isFinite(start) || !Number.isFinite(end))
        return j(400, { ok: false, error: "start_ts/end_ts inválidos" });

      const data = await invuFetchDetalle(start, end, token, Number(tipo) || 1);
      const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      return j(200, { ok: true, kind: "detalle", count: rows.length, data });
    }

    // -------- INGEST --------
    if (mode === "ingest_detalle") {
      const root = body?.data ?? {};
      const rows =
        Array.isArray(root?.data?.data) ? root.data.data :
        Array.isArray(root?.data)       ? root.data :
        Array.isArray(root)             ? root : [];

      if (!rows.length) return j(200, { ok: true, upserted: 0, reason: "payload vacío" });

      const branch = String(body?.sucursal ?? "").toLowerCase();

      const mapped = rows.map((r: any) => {
        const invuId = String(
          r.num_orden ??
          r.numero_factura ??
          r.id_ord ??
          r.id ??
          crypto.randomUUID()
        );
        return {
          id: `${branch}:${invuId}`, // PK lógica
          fecha:       parseFecha(r.fecha_cierre_date ?? r.fecha_creacion ?? r.fecha_apertura_date),
          subtotal:    N(r.subtotal ?? r.totales?.subtotal),
          itbms:       N(r.tax ?? r.totales?.tax),
          total:       N(r.total ?? r.totales?.total ?? r.total_pagar),
          propina:     N(r.propina ?? r.totales?.propina),
          num_items:   Array.isArray(r.items) ? r.items.length :
                       Array.isArray(r.detalle) ? r.detalle.length : null,
          sucursal_id: null,
          branch,
          invu_id:     invuId,
          raw:         r,
          num_transacciones: 1,
          estado:      r.pagada ?? r.status ?? null,
          source:      "invu",
          version:     VERSION,
        };
      });

      const { error } = await supabase
        .from("invu_ventas")
        .upsert(mapped, { onConflict: "id" }); // clave única segura

      if (error) return j(500, { ok: false, error: error.message || String(error) });
      return j(200, { ok: true, upserted: mapped.length });
    }

    return j(400, { ok: false, error: "Modo inválido. Usa: pull_detalle | ingest_detalle | diag" });
  } catch (e) {
    console.error("sync-ventas-v12 error:", e);
    return j(500, { ok: false, error: String(e) });
  }
});
