/* sync-ventas-v9 — INVU exacto + debug
   - Detalle:  r=citas/ordenesAllAdv/fini/{start}/ffin/{end}/tipo/1
   - Totales:  r=citas/OrdenesAllTotales/fini/{start}/ffin/{end}/tipo/1
   - Header:   AUTHORIZATION: <token> (MAYÚSCULAS, como en docs)
   - Fix: URL cruda (sin URLSearchParams) para no encodar '/'
   - Debug:
       * mode:"echo_detalle_url" → devuelve la URL y length del token
       * body.token (opcional) → fuerza token para descartar secrets desactualizados
   - Modos: echo_detalle_url, pull_detalle, pull_totales, ingest_detalle, ingest_totales
*/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const INVU_BASE = "https://api6.invupos.com/invuApiPos/index.php";

/* ───────── Tokens por sucursal ───────── */
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

/* ───────── URL builders crudos ───────── */
function urlDetalle(start: number, end: number): string {
  return `${INVU_BASE}?r=citas/ordenesAllAdv/fini/${start}/ffin/${end}/tipo/1`;
}
function urlTotales(start: number, end: number): string {
  return `${INVU_BASE}?r=citas/OrdenesAllTotales/fini/${start}/ffin/${end}/tipo/1`;
}

/* ───────── HTTP helper ───────── */
async function invuFetch(url: string, token: string) {
  console.log(`[INVU] → GET ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      AUTHORIZATION: token, // EXACTO como docs INVU
    },
  });
  const text = await res.text();
  console.log(`[INVU] ← ${res.status} :: ${text.slice(0, 220)}`);
  if (!res.ok) throw new Error(`INVU ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { data: [] }; }
}

/* ───────── utils ───────── */
function j(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}
const N = (x: any, d = 0) => {
  if (x == null) return d;
  if (typeof x === "number") return Number.isFinite(x) ? x : d;
  const n = parseFloat(String(x));
  return Number.isFinite(n) ? n : d;
};

/* ───────── Handler ───────── */
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { sucursal, start_ts, end_ts, mode = "pull_detalle", token: tokenOverride } = body || {};
    if (!sucursal || !start_ts || !end_ts) {
      return j(400, { ok: false, error: "Faltan parámetros (sucursal, start_ts, end_ts)" });
    }

    const start = Number(start_ts);
    const end   = Number(end_ts);

    // token: usa override si viene, si no el secret de la sucursal
    const token = (typeof tokenOverride === "string" && tokenOverride.length > 20)
      ? tokenOverride
      : getTokenPorSucursal(sucursal);
    if (!token) return j(400, { ok: false, error: "Sucursal o token inválido" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* ───── DEBUG: echo_detalle_url ───── */
    if (mode === "echo_detalle_url") {
      const u = urlDetalle(start, end);
      return j(200, { ok: true, url: u, header: "AUTHORIZATION", token_len: token.length });
    }

    /* ───── pull_detalle ───── */
    if (mode === "pull_detalle") {
      const u = urlDetalle(start, end);
      const data = await invuFetch(u, token);
      const count = Array.isArray((data as any)?.data) ? (data as any).data.length : 0;
      return j(200, { ok: true, kind: "detalle", count, data });
    }

    /* ───── pull_totales ───── */
    if (mode === "pull_totales") {
      const u = urlTotales(start, end);
      const data = await invuFetch(u, token);
      const count =
        Array.isArray((data as any)?.totales) ? (data as any).totales.length :
        Array.isArray((data as any)?.data)    ? (data as any).data.length    : 0;
      return j(200, { ok: true, kind: "totales", count, data });
    }

    /* ───── ingest_detalle → invu_ventas ───── */
    if (mode === "ingest_detalle") {
      const root = body?.data ?? {};
      const rows: any[] =
        Array.isArray(root?.data)    ? root.data :
        Array.isArray(root?.totales) ? root.totales :
        Array.isArray(root)          ? root : [];
      if (!rows.length) return j(200, { ok: true, upserted: 0, reason: "payload vacío" });

      const mapped = rows.map((r: any) => ({
        sucursal,
        id_orden: String(r.id ?? r.id_ord ?? r.num_orden ?? r.numero_factura ?? crypto.randomUUID()),
        fecha_creacion: r.fecha_creacion ?? r.fecha_apertura_date ?? null,
        fecha_cierre:   r.fecha_cierre   ?? r.fecha_cierre_date   ?? null,
        estado:         r.pagada ?? r.status ?? null,
        total:          N(r.total ?? r.total_pagar, 0),
        subtotal:       N(r.subtotal, 0),
        tax:            N(r.tax ?? r.impuesto, 0),
        propina:        N(r.propina, 0),
        moneda:         r?.moneda?.simbolo ?? r?.moneda ?? "$",
        raw:            r,
      }));

      const { error } = await supabase
        .from("invu_ventas")
        .upsert(mapped, { onConflict: "sucursal,id_orden" });
      if (error) return j(500, { ok: false, error: (error as any).message || String(error) });
      return j(200, { ok: true, upserted: mapped.length });
    }

    /* ───── ingest_totales → invu_totales_dia ───── */
    if (mode === "ingest_totales") {
      const root = body?.data ?? {};
      const candidates = [root?.data?.totales, root?.data?.data, root?.totales, root?.data, root];
      const rows: any[] = (candidates.find((x: any) => Array.isArray(x)) as any[]) || [];
      if (!rows.length) return j(200, { ok: true, inserted: 0, reason: "payload vacío" });

      const isDaily = (rows[0]?.fecha || rows[0]?.dia) && (rows[0]?.total != null || rows[0]?.monto != null);
      let upserts: Array<{ sucursal: string; dia: string; total_cerradas: number }>;

      if (isDaily) {
        upserts = rows.map((r: any) => ({
          sucursal,
          dia: String(r.fecha ?? r.dia).slice(0, 10),
          total_cerradas: N(r.total ?? r.monto, 0),
        }));
      } else {
        const byDay: Record<string, number> = {};
        for (const r of rows) {
          const day =
            (r.fecha_cierre_date && String(r.fecha_cierre_date).slice(0, 10)) ||
            (r.fecha && String(r.fecha).slice(0, 10)) ||
            r.dia;
          if (!day) continue;
          byDay[day] = (byDay[day] ?? 0) + N(r.total ?? r.total_pagar ?? r.monto, 0);
        }
        upserts = Object.entries(byDay).map(([dia, total]) => ({
          sucursal, dia, total_cerradas: N(total, 0),
        }));
      }

      const { error } = await supabase
        .from("invu_totales_dia")
        .upsert(upserts, { onConflict: "sucursal,dia" });
      if (error) return j(500, { ok: false, error: (error as any).message || String(error) });
      return j(200, { ok: true, inserted: upserts.length, sample: upserts[0] ?? null });
    }

    return j(400, { ok: false, error: "Modo inválido" });
  } catch (e) {
    console.error("sync-ventas-v9 error:", e);
    const msg = typeof e === "object" && e && "message" in (e as any) ? (e as any).message : String(e);
    return j(500, { ok: false, error: msg });
  }
});
