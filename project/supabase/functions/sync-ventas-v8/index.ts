/* sync-ventas-v8 — INVU pull+ingest (querystring + AUTHORIZATION) */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- Tokens por sucursal
function getTokenPorSucursal(s: string): string | undefined {
  switch ((s || "").toLowerCase()) {
    case "cangrejo": return Deno.env.get("CANGREJO_TOKEN");
    case "costa":    return Deno.env.get("COSTA_TOKEN");
    case "central":  return Deno.env.get("CENTRAL_TOKEN");
    case "sf":       return Deno.env.get("SF_TOKEN");
    case "museo":    return Deno.env.get("MUSEO_TOKEN");
    default:         return undefined;
  }
}

// ---- URLs INVU (OJO: case-sensitive exacto)
function urlTotales(start: number, end: number): string {
  const u = new URL("https://api6.invupos.com/invuApiPos/index.php");
  // Mayúsculas exactas: OrdenesAllTotales
  u.searchParams.set("r", "citas/OrdenesAllTotales");
  u.searchParams.set("fini", String(start));
  u.searchParams.set("ffin", String(end));
  // Cerradas = 1 (según doc que compartiste)
  u.searchParams.set("tipo", "1");
  return u.toString();
}
function urlDetalle(start: number, end: number): string {
  const u = new URL("https://api6.invupos.com/invuApiPos/index.php");
  // Este endpoint es todo en minúscula salvo AllAd: ordenesAllAd
  u.searchParams.set("r", "citas/ordenesAllAd");
  u.searchParams.set("fini", String(start));
  u.searchParams.set("ffin", String(end));
  u.searchParams.set("tipo", "1");
  return u.toString();
}

// ---- Fetch que respeta AUTHORIZATION en MAYÚSCULAS
async function invuFetch(url: string, token: string) {
  const headers = new Headers([
    ["accept", "application/json"],
    ["AUTHORIZATION", token],  // <- clave exacta en mayúsculas
  ]);
  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  console.log(
    `[INVU] status=${res.status} url=${url} hdr=AUTHORIZATION tail=${token?.slice(-6)} bodyHead=${text.slice(0,160)}`
  );
  if (!res.ok) throw new Error(`INVU ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { data: [] }; }
}

function j(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const { sucursal, start_ts, end_ts, mode = "pull_totales" } = payload || {};

    if (!sucursal || !start_ts || !end_ts) {
      return j(400, { ok: false, error: "Faltan parametros: sucursal, start_ts, end_ts" });
    }
    const token = getTokenPorSucursal(sucursal);
    if (!token) return j(400, { ok: false, error: "Sucursal o token inválidos" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (mode === "pull_totales") {
      const url = urlTotales(start_ts, end_ts);
      const data = await invuFetch(url, token);
      return j(200, { ok: true, kind: "totales", count: data?.data?.length ?? 0, data });
    }

    if (mode === "pull_detalle") {
      const url = urlDetalle(start_ts, end_ts);
      const data = await invuFetch(url, token);
      return j(200, { ok: true, kind: "detalle", count: data?.data?.length ?? 0, data });
    }

    if (mode === "ingest_totales") {
      const rows = payload?.data?.data ?? [];
      const upserts = rows.map((r: any) => ({
        sucursal,
        dia: r.fecha ?? r.dia ?? null,                 // ajusta si tu JSON usa otra clave de fecha
        total_cerradas: Number(r.total ?? r.monto ?? 0),
      }));
      const { error } = await supabase
        .from("invu_totales_dia")
        .upsert(upserts, { onConflict: "sucursal,dia" });
      if (error) throw error;
      return j(200, { ok: true, inserted: upserts.length });
    }

    if (mode === "ingest_detalle") {
      const rows = payload?.data?.data ?? [];
      const mapped = rows.map((r: any) => ({
        sucursal,
        id_orden: String(r.id ?? r.num_orden ?? r.numero_factura ?? crypto.randomUUID()),
        fecha_creacion: r.fecha_creacion ?? r.fecha_creacion_date ?? null,
        fecha_cierre:   r.fecha_cierre ?? r.fecha_cierre_date ?? null,
        estado:         r.pagada ?? r.status ?? null,
        total:          Number(r.total ?? r.total_pagar ?? 0),
        subtotal:       Number(r.subtotal ?? 0),
        tax:            Number(r.tax ?? r.impuesto ?? 0),
        propina:        Number(r.propina ?? 0),
        moneda:         r?.moneda?.simbolo ?? r?.moneda ?? "$",
        raw:            r,
      }));
      const { error } = await supabase
        .from("invu_ventas")
        .upsert(mapped, { onConflict: "sucursal,id_orden" });
      if (error) throw error;
      return j(200, { ok: true, upserted: mapped.length });
    }

    return j(400, { ok: false, error: "Modo inválido" });
  } catch (e) {
    console.error("sync-ventas-v8 error:", e);
    return j(500, { ok: false, error: String(e) });
  }
});

