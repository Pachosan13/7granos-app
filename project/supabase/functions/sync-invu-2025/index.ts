// supabase/functions/sync-invu-2025/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Branch = { slug: string }; // e.g. "costa" | "cangrejo" | "museo"

const INVU_BASE = Deno.env.get("INVU_BASE") ??
  "https://api6.invupos.com/invuApiPos/index.php";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// sucursales a sincronizar
const BRANCHES: Branch[] = [
  { slug: "costa" },
  { slug: "cangrejo" },
  { slug: "museo" },
];

const YEAR = 2025;
const MONTH_START = 1;
const MONTH_END   = 12;

async function fetchJson(url: string, headers: Headers, retries = 3, waitMs = 800): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers });
    if (res.ok) return await res.json().catch(() => ({}));
    console.warn(`[INVU] ${url} → ${res.status} ${res.statusText}`);
    if (i < retries - 1) await new Promise(r => setTimeout(r, waitMs * (i + 1)));
  }
  throw new Error(`Failed after ${retries} attempts: ${url}`);
}

function epochRangeForMonth(year: number, month1to12: number) {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0));
  const end   = new Date(Date.UTC(year, month1to12, 0, 23, 59, 59));
  return {
    fini: Math.floor(start.getTime() / 1000),
    ffin: Math.floor(end.getTime() / 1000),
    mesISO: start.toISOString().slice(0, 10),
  };
}

// 🔐 pide token a tu edge function existente "invu-token-refresh"
async function getTokenForBranch(slug: string): Promise<string> {
  const url = `${SUPABASE_URL}/functions/v1/invu-token-refresh?branch=${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) throw new Error(`token-refresh failed for ${slug}: ${res.status}`);
  const data = await res.json().catch(() => ({} as any));
  // Esperamos { token: "..." } o { authorization: "..." }
  return data.token ?? data.authorization ?? "";
}

async function upsertBatchToSupabase(payload: any[], sucursalSlug: string, mesISO: string) {
  const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/ingest_invu_ventas_batch`;
  const body = JSON.stringify({
    p_payload: payload,
    p_sucursal_slug: sucursalSlug,
    p_mes: mesISO
  });
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Prefer": "return=representation"
    },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[RPC] ${res.status} ${res.statusText} → ${text}`);
  }
  return await res.json().catch(() => null);
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const qsBranch = url.searchParams.get("branch");
    const qsYear = url.searchParams.get("year");
    const year = qsYear ? Number(qsYear) : YEAR;
    const branches = qsBranch ? BRANCHES.filter(b => b.slug === qsBranch) : BRANCHES;

    for (const b of branches) {
      let token = await getTokenForBranch(b.slug);
      if (!token) {
        console.warn(`[INVU] No token for branch ${b.slug}, skipping.`);
        continue;
      }
      const headers = new Headers({ "authorization": token });

      for (let m = MONTH_START; m <= MONTH_END; m++) {
        const { fini, ffin, mesISO } = epochRangeForMonth(year, m);
        const invuUrl = `${INVU_BASE}?r=ventas/list/fini/${fini}/ffin/${ffin}`;
        try {
          const data = await fetchJson(invuUrl, headers, 3, 800);
          const rows = Array.isArray(data) ? data : (data?.data ?? []);
          console.log(`[INVU] ${b.slug} ${year}-${String(m).padStart(2,'0')} → ${rows.length} ventas`);
          if (rows.length > 0) {
            await upsertBatchToSupabase(rows, b.slug, mesISO);
            console.log(`[RPC] Upsert OK → ${b.slug} ${mesISO}`);
          }
          await new Promise(r => setTimeout(r, 500)); // rate-limit
        } catch (e) {
          console.error(`[SYNC ERR] ${b.slug} ${year}-${m}:`, e?.message ?? e);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
