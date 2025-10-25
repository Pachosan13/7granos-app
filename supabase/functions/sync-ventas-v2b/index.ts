// supabase/functions/sync-ventas-v2b/index.ts
// UPSERT idempotente en public.invu_ventas usando on_conflict=invu_id
// Fuente: citas/ordenesAllAdv(tipo=all) por sucursal y día
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION = "sync-ventas-v2b::ordenesAllAdv(tipo=all)+upsert(on_conflict=invu_id)";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "content-type": "application/json" } });

const PROJECT_REF = Deno.env.get("PROJECT_REF") ?? "pktlfjebomjxftszefvp";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? `https://${PROJECT_REF}.supabase.co`;
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SERVICE_KEY") ||
  "";

const INVU_TOKENS_JSON = Deno.env.get("INVU_TOKENS_JSON");
const TOKENS_FALLBACK = {
  sf: Deno.env.get("SF_TOKEN"),
  cangrejo: Deno.env.get("CANGREJO_TOKEN"),
  central: Deno.env.get("CENTRAL_TOKEN"),
  museo: Deno.env.get("MUSEO_TOKEN"),
  costa: Deno.env.get("COSTA_TOKEN"),
} as Record<string, string | undefined>;

const SUCURSAL_BY_SLUG: Record<string, string> = {
  sf: "1918f8f7-9b5d-4f6a-9b53-a953f82b71ad",
  cangrejo: "716863d5-7b75-430d-835b-95ec7f3de1eb",
  central: "b882cb07-4ca7-41ec-9b02-3d1139cb66a3",
  museo: "c68cf4cf-1811-4279-9fe6-4563e11eb5e5",
  costa: "d654870f-c6f5-4887-822c-fdfe8072ad92",
};

const INVU_BASE = "https://api6.invupos.com/invuApiPos/index.php";

function todayYMD() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Panama" }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function* eachDay(fromYmd: string, toYmd: string) {
  const from = new Date(`${fromYmd}T00:00:00`);
  const to = new Date(`${toYmd}T00:00:00`);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    yield `${y}-${m}-${day}`;
  }
}

function panamaDayEpochRange(ymd: string) {
  const startLocal = new Date(new Date(`${ymd}T00:00:00`).toLocaleString("en-US", { timeZone: "America/Panama" }));
  const endLocal = new Date(startLocal);
  endLocal.setDate(endLocal.getDate() + 1);
  const fini = Math.floor(startLocal.getTime() / 1000);
  const ffin = Math.floor(endLocal.getTime() / 1000) - 1;
  return { fini, ffin };
}

function loadTokens(): Record<string, string> {
  if (INVU_TOKENS_JSON) {
    try {
      const parsed = JSON.parse(INVU_TOKENS_JSON);
      if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    } catch { /* fallback */ }
  }
  const out: Record<string, string> = {};
  for (const k of Object.keys(TOKENS_FALLBACK)) {
    const v = TOKENS_FALLBACK[k];
    if (v) out[k] = v;
  }
  return out;
}

async function fetchOrdenesAllAdv(branch: string, ymd: string, token: string) {
  const { fini, ffin } = panamaDayEpochRange(ymd);
  const url = `${INVU_BASE}?r=citas/ordenesAllAdv/fini/${fini}/ffin/${ffin}/tipo/all`;
  const r = await fetch(url, { headers: { AUTHORIZATION: token, accept: "application/json" } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`INVU ${branch} ${ymd} ${r.status} ${txt.slice(0, 200)}`);
  try {
    const parsed = JSON.parse(txt);
    const arr = Array.isArray(parsed?.data) ? parsed.data : [];
    return arr;
  } catch {
    return [];
  }
}

type InvuOrden = {
  id: string;
  fecha_apertura_date?: string | null;
  fecha_cierre_date?: string | null;
  totales?: { subtotal?: number; tax?: number; total?: number };
  items?: Array<{ cantidad?: number }> | null;
  propinas?: Array<{ monto?: number }> | null;
};

function toDateOnly(s?: string | null): string | null {
  if (!s) return null;
  return s.slice(0, 10);
}

function buildPayload(branch: string, rows: InvuOrden[]) {
  const sucursal_id = SUCURSAL_BY_SLUG[branch] ?? null;
  const out = [];
  for (const o of rows) {
    const fecha = toDateOnly(o.fecha_cierre_date) || toDateOnly(o.fecha_apertura_date) || null;
    let num_items = 0;
    if (Array.isArray(o.items)) for (const it of o.items) num_items += Number(it?.cantidad ?? 0);
    let propina = 0;
    if (Array.isArray(o.propinas)) for (const p of o.propinas) propina += Number(p?.monto ?? 0);
    const subtotal = Number(o?.totales?.subtotal ?? 0);
    const itbms = Number(o?.totales?.tax ?? 0);
    const total = Number(o?.totales?.total ?? 0);

    out.push({
      invu_id: String(o.id),
      branch,
      sucursal_id,
      fecha,
      subtotal,
      itbms,
      propina,
      total,
      num_items,
      raw: o,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = new URL(req.url);
    const desde = url.searchParams.get("desde") ?? todayYMD();
    const hasta = url.searchParams.get("hasta") ?? desde;
    const branches = ["sf", "cangrejo", "central", "museo", "costa"];
    const tokens = loadTokens();

    let totalFetched = 0;
    let totalInserted = 0;
    const summary: Array<{ branch: string; fetched: number; inserted: number; lastError: string | null }> = [];

    for (const branch of branches) {
      const token = tokens[branch];
      if (!token) {
        summary.push({ branch, fetched: 0, inserted: 0, lastError: "missing-token" });
        continue;
      }

      for (const ymd of eachDay(desde, hasta)) {
        let invuRows: InvuOrden[] = [];
        try {
          invuRows = await fetchOrdenesAllAdv(branch, ymd, token);
        } catch (e) {
          summary.push({ branch, fetched: 0, inserted: 0, lastError: `fetch-fail ${String(e?.message || e)}` });
          continue;
        }
        totalFetched += invuRows.length;
        if (!invuRows.length) {
          summary.push({ branch, fetched: 0, inserted: 0, lastError: null });
          continue;
        }

        const payload = buildPayload(branch, invuRows);

        // UPSERT idempotente
        const insertUrl = `${SUPABASE_URL}/rest/v1/invu_ventas?on_conflict=invu_id`;
        const insResp = await fetch(insertUrl, {
          method: "POST",
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify(payload),
        });

        if (!insResp.ok) {
          const errText = await insResp.text();
          if (insResp.status === 409) {
            summary.push({ branch, fetched: payload.length, inserted: 0, lastError: null });
          } else {
            summary.push({ branch, fetched: payload.length, inserted: 0, lastError: `insert-fail ${insResp.status} ${errText}` });
          }
          continue;
        }

        const rows = await insResp.json();
        const inserted = Array.isArray(rows) ? rows.length : 0;
        totalInserted += inserted;
        summary.push({ branch, fetched: payload.length, inserted, lastError: null });
      }
    }

    return ok({ success: true, version: VERSION, desde, hasta, totalFetched, totalInserted, summary });
  } catch (e) {
    return ok({ success: false, version: VERSION, error: String(e?.message || e) }, 500);
  }
});
