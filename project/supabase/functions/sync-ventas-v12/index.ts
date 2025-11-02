// 7 Granos — INVU Sync (detalle) — v12
// - pull_detalle: GET citas/ordenesAllAdv/fini/{start}/ffin/{end}/tipo/1
// - ingest_detalle: upsert a invu_ventas (solo columnas existentes)

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
    } catch {
      return null;
    }
  }
  return s.slice(0, 10);
};

function getTokenPorSucursal(branch: string): string | undefined {
  switch ((branch || "").toLowerCase()) {
    case "cangrejo": return Deno.env.get("CANGREJO_TOKEN") || undefined;
    case "costa":    return Deno.env.get("COSTA_TOKEN")    || undefined;
    case "central":  return Deno.env.get("CENTRAL_TOKEN")  || undefined;
    case "sf":       return Deno.env.get("SF_TOKEN")       || undefined;
    case "museo":    return Deno.env.get("MUSEO_TOKEN")    || undefined;
    default:         return undefined;
  }
}

function invuUrlDetalle(start: number, end: number): string {
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

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { mode = "pull_detalle", sucursal, start_ts, end_ts } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (mode === "pull_detalle") {
      if (!sucursal || !start_ts || !end_ts) {
        return j(400, { ok: false, error: "Faltan parámetros: sucursal, start_ts, end_ts" });
      }
      const token = body.token || getTokenPorSucursal(sucursal);
      if (!token) return j(400, { ok: false, error: "Token no encontrado para la sucursal" });

      const url = invuUrlDetalle(Number(start_ts), Number(end_ts));
      const data = await invuFetch(url, token);

      const rows: any[] =
        Array.isArray((data as any)?.data) ? (data as any).data :
        Array.isArray(data)                ? (data as any[])       : [];

      return j(200, { ok: true, kind: "detalle", count: rows.length, data });
    }

    if (mode === "ingest_detalle") {
      const root = body?.data ?? {};
      const rows: any[] =
        Array.isArray(root?.data?.data) ? root.data.data :
        Array.isArray(root?.data)       ? root.data :
        Array.isArray(root)             ? root :
        [];

      if (!Array.isArray(rows) || rows.length === 0) {
        return j(200, { ok: true, upserted: 0, reason: "payload vacío" });
      }

      const branch: string = String(body?.sucursal ?? "").toLowerCase();

      const mapped = rows.map((r) => ({
        // columnas REALES de invu_ventas:
        fecha: parseFecha(r.fecha_cierre_date ?? r.fecha_creacion ?? r.fecha_apertura_date),
        subtotal: N(r.subtotal ?? r.totales?.subtotal),
        itbms: N(r.tax ?? r.totales?.tax),
        total: N(r.total ?? r.totales?.total ?? r.total_pagar),
        propina: N(r.propina ?? r.totales?.propina),
        num_items: Array.isArray(r.items) ? r.items.length : (Array.isArray(r.detalle) ? r.detalle.length : null),

        sucursal_id: null,  // no lo tenemos
        branch,             

        invu_id: String(
          r.num_orden ??
          r.numero_factura ??
          r.id_ord ??
          r.id ??
          crypto.randomUUID()
        ),
        raw: r,

        num_transacciones: 1,
        estado: (r.pagada ?? r.status ?? null) as string | null,
      }));

      const { error } = await supabase
        .from("invu_ventas")
        .upsert(mapped, { onConflict: "branch,invu_id" });

      if (error) return j(500, { ok: false, error: (error as any).message || String(error) });

      return j(200, { ok: true, upserted: mapped.length });
    }

    return j(400, { ok: false, error: "Modo inválido. Usa: pull_detalle | ingest_detalle" });
  } catch (e) {
    console.error("sync-ventas-v12 error:", e);
    return j(500, { ok: false, error: String(e) });
  }
});
