// supabase/functions/sync-ventas-v2/index.ts
// Descarga ventas de INVU (por sucursal) y carga en public.invu_ventas.
// Estrategia anti-duplicados: DELETE por sucursal+rango y luego INSERT.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROJECT_REF = Deno.env.get("PROJECT_REF") ?? "pktlfjebomjxftszefvp";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? `https://${PROJECT_REF}.supabase.co`;
const SRK = Deno.env.get("SERVICE_ROLE_KEY")
  || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  || Deno.env.get("SERVICE_KEY") || "";

// Tokens por sucursal desde secrets (JSON tipo { "sf": "TOKEN...", "museo": "TOKEN..." ... })
const TOKENS_JSON = Deno.env.get("INVU_TOKENS_JSON") ?? "{}";
const INVU_TOKENS: Record<string, string> = (() => {
  try { return JSON.parse(TOKENS_JSON); } catch { return {}; }
})();

// Mapeo slug -> sucursal_id (ajustado a tus UUID reales)
const SUCURSAL_BY_SLUG: Record<string, string> = {
  sf:       "1918f8f7-9b5d-4f6a-9b53-a953f82b71ad",
  cangrejo: "716863d5-7b75-430d-835b-95ec7f3de1eb",
  central:  "b882cb07-4ca7-41ec-9b02-3d1139cb66a3",
  museo:    "c68cf4cf-1811-4279-9fe6-4563e11eb5e5",
  costa:    "d654870f-c6f5-4887-822c-fdfe8072ad92",
};

// Utiles
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { ...CORS, "content-type": "application/json" },
});

function epochStart(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00Z`);
  return Math.floor(d.getTime() / 1000);
}
function epochEnd(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCMilliseconds(-1); // 23:59:59.999 del mismo día
  return Math.floor(d.getTime() / 1000);
}

async function fetchOrdenes(branch: string, finiEpoch: number, ffinEpoch: number) {
  const token = INVU_TOKENS[branch];
  if (!token) return { data: [], error: `No token for branch ${branch}` };

  const url = `https://api6.invupos.com/invuApiPos/index.php?r=citas/ordenesAllAdv/fini/${finiEpoch}/ffin/${ffinEpoch}/tipo/all`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: token, accept: "application/json" },
  });

  const txt = await res.text();
  try {
    const parsed = JSON.parse(txt);
    const data = Array.isArray(parsed?.data) ? parsed.data : [];
    return { data, error: null, status: res.status };
  } catch (_e) {
    return { data: [], error: `parse-error: ${txt.slice(0, 300)}`, status: res.status };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const u = new URL(req.url);
    const desde = u.searchParams.get("desde") ?? "2025-10-01";
    const hasta = u.searchParams.get("hasta") ?? "2025-10-07";

    const fini = epochStart(desde);
    const ffin = epochEnd(hasta);

    const branches = Object.keys(SUCURSAL_BY_SLUG);
    const summary: Array<{
      branch: string;
      deleted: number;
      inserted: number;
      fetched: number;
      lastError: string | null;
    }> = [];

    let grandInserted = 0;
    let grandFetched = 0;
    let grandDeleted = 0;

    for (const branch of branches) {
      const sucursal_id = SUCURSAL_BY_SLUG[branch];
      const { data: ordenes, error, status } = await fetchOrdenes(branch, fini, ffin);
      grandFetched += ordenes.length;

      if (error) {
        summary.push({ branch, deleted: 0, inserted: 0, fetched: 0, lastError: `${status ?? ""} ${error}` });
        continue;
      }

      // 1) Anti-duplicados: DELETE por sucursal_id y rango de fecha
      const delQ =
        `${SUPABASE_URL}/rest/v1/invu_ventas` +
        `?sucursal_id=eq.${sucursal_id}` +
        `&fecha=gte.${encodeURIComponent(new Date(epochStart(desde)*1000).toISOString())}` +
        `&fecha=lte.${encodeURIComponent(new Date(epochEnd(hasta)*1000).toISOString())}`;
      const del = await fetch(delQ, {
        method: "DELETE",
        headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, Accept: "application/json", Prefer: "return=representation" },
      });
      let deleted = 0;
      if (del.ok) {
        const rows = await del.json().catch(() => []);
        deleted = Array.isArray(rows) ? rows.length : 0;
      }

      // 2) Mapear ordenes -> invu_ventas
      const mapped = ordenes.map((v: any) => ({
        id: crypto.randomUUID(), // id local
        sucursal_id,
        invu_id: v?.id?.toString() ?? null, // id INVU de la venta
        fecha: v?.fecha_cierre_date
          ? new Date(v.fecha_cierre_date.replace(" ", "T") + "Z").toISOString()
          : new Date().toISOString(),
        subtotal: Number(v?.subtotal ?? v?.totales?.subtotal ?? 0),
        itbms: Number(v?.tax ?? v?.totales?.tax ?? 0),
        propina: Number(Array.isArray(v?.propinas) ? v.propinas.reduce((a: number, p: any) => a + Number(p?.monto ?? 0), 0) : 0),
        total: Number(v?.total ?? v?.totales?.total ?? 0),
        num_transacciones: 1, // cada orden es 1 transacción
        raw: v,
      }));

      // 3) INSERT
      let inserted = 0;
      if (mapped.length) {
        const ins = await fetch(`${SUPABASE_URL}/rest/v1/invu_ventas`, {
          method: "POST",
          headers: {
            apikey: SRK,
            Authorization: `Bearer ${SRK}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(mapped),
        });
        if (ins.ok) {
          const rows = await ins.json();
          inserted = Array.isArray(rows) ? rows.length : 0;
        } else {
          const t = await ins.text();
          summary.push({ branch, deleted, inserted: 0, fetched: ordenes.length, lastError: `insert-fail ${ins.status} ${t}` });
          grandDeleted += deleted;
          continue;
        }
      }

      grandDeleted += deleted;
      grandInserted += inserted;
      summary.push({ branch, deleted, inserted, fetched: ordenes.length, lastError: null });
    }

    return ok({
      success: true,
      version: "sync-ventas-v2::ordenesAllAdv(tipo=all)+delete-then-insert",
      desde, hasta,
      totalFetched: grandFetched,
      totalDeleted: grandDeleted,
      totalInserted: grandInserted,
      summary,
    });
  } catch (e: any) {
    return ok({ success: false, error: String(e?.message || e) }, 500);
  }
});
