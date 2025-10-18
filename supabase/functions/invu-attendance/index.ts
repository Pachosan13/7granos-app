// supabase/functions/invu-attendance/index.ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
function preflight(req: Request) { if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders }); return null; }
function withCors(body: BodyInit | null, init: ResponseInit = {}) { return new Response(body, { ...init, headers: { ...(init.headers||{}), ...corsHeaders } }); }

function panamaStartEpoch(dateISO: string): number { const d = new Date(`${dateISO}T00:00:00-05:00`); return Math.floor(d.getTime()/1000); }
function panamaEndEpoch(dateISO: string): number { const d = new Date(`${dateISO}T00:00:00-05:00`); d.setDate(d.getDate()+1); return Math.floor(d.getTime()/1000); }
function enumeratePanamaDatesFromEpoch(fini: number, ffin: number): string[] {
  const toISO = (d: Date) => d.toISOString().slice(0,10);
  const start = new Date(fini*1000), end = new Date(ffin*1000);
  const dates: string[] = []; let cursor = new Date(`${toISO(start)}T00:00:00-05:00`); const limit = new Date(`${toISO(end)}T00:00:00-05:00`);
  while (cursor <= limit) { dates.push(toISO(cursor)); cursor.setDate(cursor.getDate()+1); } return dates;
}
function tokenForBranch(branch: string | null): string | null {
  if (!branch) return null; const key = branch.toLowerCase();
  const envMap: Record<string,string|undefined> = {
    sf: Deno.env.get("SF_TOKEN"), cangrejo: Deno.env.get("CANGREJO_TOKEN"),
    costa: Deno.env.get("COSTA_TOKEN"), museo: Deno.env.get("MUSEO_TOKEN"),
    central: Deno.env.get("CENTRAL_TOKEN"),
  }; return envMap[key] ?? null;
}
const INVU_BASE = (Deno.env.get("INVU_BASE_URL")?.trim() || "https://api6.invupos.com").replace(/\/+$/,"");
const INVU_PATH = (Deno.env.get("INVU_ATTENDANCE_REMOTE_PATHS")?.trim() || "empleados/movimientos").replace(/^\/+/,"");
const AUTH_HEADER = Deno.env.get("INVU_AUTH_HEADER")?.trim() || "Authorization";

async function fetchInvuRange(token: string, fini: number, ffin: number, signal?: AbortSignal) {
  const url = `${INVU_BASE}/invuApiPos/index.php?r=${INVU_PATH}/fini/${Math.trunc(fini)}/ffin/${Math.trunc(ffin)}`;
  const res = await fetch(url, { headers: { [AUTH_HEADER]: token, Accept: "application/json" }, signal });
  const text = await res.text();
  if (!res.ok) { let detail: unknown; try { detail = JSON.parse(text); } catch { detail = text?.slice(0,300) || null; } throw { status: res.status, detail }; }
  try { return JSON.parse(text); } catch { return text; }
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const { searchParams } = new URL(req.url);
  const branch = searchParams.get("branch");
  const date   = searchParams.get("date");
  const finiQ  = searchParams.get("fini");
  const ffinQ  = searchParams.get("ffin");

  const token = tokenForBranch(branch);
  if (!branch || !token) return withCors(JSON.stringify({ ok:false, error:"Invalid or missing branch/token" }), { status:400, headers:{ "Content-Type":"application/json" } });

  type Range = { fini:number; ffin:number; dateISO:string };
  const ranges: Range[] = [];

  if (date) {
    ranges.push({ fini: panamaStartEpoch(date), ffin: panamaEndEpoch(date), dateISO: date });
  } else if (finiQ && ffinQ) {
    const fini = Number(finiQ), ffin = Number(ffinQ);
    if (!Number.isFinite(fini) || !Number.isFinite(ffin) || fini<=0 || ffin<=0 || ffin<fini) {
      return withCors(JSON.stringify({ ok:false, error:"Invalid fini/ffin" }), { status:400, headers:{ "Content-Type":"application/json" } });
    }
    for (const d of enumeratePanamaDatesFromEpoch(fini, ffin)) {
      ranges.push({ fini: panamaStartEpoch(d), ffin: panamaEndEpoch(d), dateISO: d });
    }
  } else {
    return withCors(JSON.stringify({ ok:false, error:"Missing date or fini/ffin" }), { status:400, headers:{ "Content-Type":"application/json" } });
  }

  const controller = new AbortController(); const t = setTimeout(() => controller.abort("timeout"), 15000);
  try {
    const results = [];
    for (const r of ranges) { const data = await fetchInvuRange(token, r.fini, r.ffin, controller.signal); results.push({ date: r.dateISO, data }); }
    clearTimeout(t);
    return withCors(JSON.stringify({ ok:true, branch, mode: date ? "single-day" : "multi-day", days: results.length, results }), { status:200, headers:{ "Content-Type":"application/json" } });
  } catch (err:any) {
    clearTimeout(t);
    return withCors(JSON.stringify({ ok:false, error:"INVU fetch failed", status: err?.status ?? 502, detail: err?.detail ?? (err?.message || String(err)) }), { status: err?.status ?? 502, headers:{ "Content-Type":"application/json" } });
  }
});
