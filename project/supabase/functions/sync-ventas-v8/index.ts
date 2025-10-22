import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "sync-ventas-v8-2025-10-22-ROBUST+AUTO";
const SF_UUID = "1918f8f7-9b5d-4f6a-9b53-a953f82b71ad";

type VentaDetalleIn = {
  idorden?: string | null;
  total?: number | string | null;
  subtotal?: number | string | null;
  itbms?: number | string | null;
  fecha_cierre?: string | null;
  fecha?: string | null;
  created_at?: string | null;
  estado?: string | null;
  importe?: number | string | null;
  monto?: number | string | null;
  monto_total?: number | string | null;
  grand_total?: number | string | null;
};

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "ping";   // ping | diag | insert | sync
    const sucursal = url.searchParams.get("sucursal") ?? "";
    const desde = url.searchParams.get("desde") ?? "";
    const hasta = url.searchParams.get("hasta") ?? "";
    const source = url.searchParams.get("source") ?? "invu";

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (mode === "ping") return j({ ok: true, mode, version: VERSION, now: new Date().toISOString() });

    if (mode === "diag") {
      return j({
        ok: true, mode, version: VERSION,
        has_SUPABASE_URL: !!SUPABASE_URL,
        has_SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_ROLE,
        has_INVU_BASE_URL: !!Deno.env.get("INVU_BASE_URL"),
        has_SF_TOKEN: !!Deno.env.get("SF_TOKEN"),
        has_INVU_SALES_PATH: !!Deno.env.get("INVU_SALES_PATH"),
        has_INVU_SALES_URL: !!Deno.env.get("INVU_SALES_URL"),
      });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return j({ ok: false, version: VERSION, error: "faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // probe conexión básica
    {
      const { error: probeErr } = await sb.from("ventas").select("id", { head: true, count: "exact" }).limit(1);
      if (probeErr) return j({ ok: false, version: VERSION, step: "probe", error: probeErr.message ?? probeErr }, 500);
    }

    if (mode === "insert") {
      if (!sucursal || !desde || !hasta) return j({ ok: false, version: VERSION, error: "Faltan parámetros sucursal|desde|hasta" }, 400);
      if (sucursal !== "sf") return j({ ok: false, version: VERSION, error: "Solo SF tiene token vigente" }, 401);
      const r = await insertDummyForDay(sb, desde);
      if (!r.ok) return j({ ...r, version: VERSION }, r.status ?? 500);
      return j({ ok: true, version: VERSION, mode, note: "Escritura de prueba completada", sucursal, desde, hasta });
    }

    if (mode === "sync") {
      if (!sucursal || !desde || !hasta) return j({ ok: false, version: VERSION, error: "Faltan parámetros sucursal|desde|hasta" }, 400);
      if (sucursal !== "sf") return j({ ok: false, version: VERSION, error: "Solo SF tiene token vigente" }, 401);

      if (source === "dummy") {
        const days = enumerateDays(desde, hasta);
        let okCnt = 0;
        for (const day of days) {
          const r = await insertDummyForDay(sb, day);
          if (r.ok) okCnt++;
        }
        return j({ ok: true, version: VERSION, mode, note: "SYNC dummy OK", days: days.length, ok: okCnt });
      }

      // === INVU real: override con auto-permutaciones ===
      const token = Deno.env.get("SF_TOKEN")!;
      const override = Deno.env.get("INVU_SALES_URL"); // URL con placeholders (opcional)
      if (override) {
        const candidates = buildOverrideCandidates(override, desde, hasta);
        const attempts: Array<{ url: string; status: number; preview?: string }> = [];

        for (const u of candidates) {
          const r = await fetch(u, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          });
          if (r.ok) {
            const arr = await safeArray(r);
            const { ventasByDia, detalleRows } = normalizeItems(arr);
            const upErr = await upsertVentas(sb, ventasByDia);
            if (upErr) return j({ ok: false, version: VERSION, step: "ventas.upsert", error: upErr }, 500);
            const detErr = await upsertDetalle(sb, detalleRows);
            if (detErr) return j({ ok: false, version: VERSION, step: "detalle.upsert", error: detErr }, 500);
            return j({
              ok: true, version: VERSION, mode, note: "SYNC INVU SF OK (override/auto)",
              desde, hasta, ventas_dias: ventasByDia.size, detalle_rows: detalleRows.length, used: u
            });
          } else {
            attempts.push({ url: u, status: r.status, preview: await safePreview(r) });
            // Si no es 404, usualmente es problema de auth/servidor: corta y reporta
            if (r.status !== 404) {
              return j({ ok: false, version: VERSION, step: "invu.fetch.override", attempts }, 502);
            }
          }
        }
        // Todos fallaron
        return j({ ok: false, version: VERSION, step: "invu.fetch.override", attempts }, 502);
      }

      // === Fallback antiguo por paths conocidos ===
      const base = Deno.env.get("INVU_BASE_URL")!;
      const path = Deno.env.get("INVU_SALES_PATH") ?? "/ventas";
      const items = await fetchInvuAny(base, token, dedupe([path, "/ventas", "/orders", "/GetSales", "/GetInvoices"]), desde, hasta);
      if ("error" in items) return j({ ok: false, version: VERSION, step: "invu.fetch", ...items }, 502);

      const { ventasByDia, detalleRows } = normalizeItems(items);
      const upErr = await upsertVentas(sb, ventasByDia);
      if (upErr) return j({ ok: false, version: VERSION, step: "ventas.upsert", error: upErr }, 500);
      const detErr = await upsertDetalle(sb, detalleRows);
      if (detErr) return j({ ok: false, version: VERSION, step: "detalle.upsert", error: detErr }, 500);

      return j({ ok: true, version: VERSION, mode, note: "SYNC INVU SF OK", desde, hasta, ventas_dias: ventasByDia.size, detalle_rows: detalleRows.length });
    }

    // help
    return j({
      ok: true, version: VERSION, mode,
      help: {
        ping: "?mode=ping",
        diag: "?mode=diag",
        insert_dummy: "?mode=insert&sucursal=sf&desde=YYYY-MM-DD&hasta=YYYY-MM-DD",
        sync_invu: "?mode=sync&sucursal=sf&desde=YYYY-MM-DD&hasta=YYYY-MM-DD",
        sync_dummy: "?mode=sync&sucursal=sf&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&source=dummy"
      }
    });

  } catch (e) {
    return j({ ok: false, version: VERSION, error: String(e) }, 500);
  }
});

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

// ===== util num/fecha =====
function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Number(n) : 0;
}
function toNumFrom(it: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) if (k in it) return toNum((it as any)[k]);
  return 0;
}
function pickDia(it: VentaDetalleIn): string {
  const raw = it.fecha_cierre ?? it.fecha ?? it.created_at ?? new Date().toISOString();
  return raw.slice(0, 10);
}
function enumerateDays(from: string, to: string): string[] {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  const out: string[] = [];
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
function stripTrailingSlash(s: string) { return s.endsWith("/") ? s.slice(0, -1) : s; }
function dedupe<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

// Panamá -05:00
function toEpochSeconds(dateYYYYMMDD: string): number {
  const d = new Date(`${dateYYYYMMDD}T00:00:00-05:00`);
  return Math.floor(d.getTime() / 1000);
}
function toEpochMillis(dateYYYYMMDD: string): number {
  const d = new Date(`${dateYYYYMMDD}T00:00:00-05:00`);
  return d.getTime();
}

// ===== placeholders robustos =====
function replaceTpl(s: string, desde: string, hasta: string) {
  const pairs: Array<[string, string]> = [
    ["{desde}", desde], ["{hasta}", hasta],
    ["{desde_epoch}", String(toEpochSeconds(desde))],
    ["{hasta_epoch}", String(toEpochSeconds(hasta))],
    ["{desde_epoch_ms}", String(toEpochMillis(desde))],
    ["{hasta_epoch_ms}", String(toEpochMillis(hasta))],
    ["%7Bdesde%7D", desde], ["%7Bhasta%7D", hasta],
    ["%7Bdesde_epoch%7D", String(toEpochSeconds(desde))],
    ["%7Bhasta_epoch%7D", String(toEpochSeconds(hasta))],
    ["%7Bdesde_epoch_ms%7D", String(toEpochMillis(desde))],
    ["%7Bhasta_epoch_ms%7D", String(toEpochMillis(hasta))],
    ["__DESDE__", desde], ["__HASTA__", hasta],
    ["__DESDE_EPOCH__", String(toEpochSeconds(desde))],
    ["__HASTA_EPOCH__", String(toEpochSeconds(hasta))],
    ["__DESDE_EPOCH_MS__", String(toEpochMillis(desde))],
    ["__HASTA_EPOCH_MS__", String(toEpochMillis(hasta))],
  ];
  let out = s;
  for (const [k, v] of pairs) out = out.split(k).join(v);
  return out;
}
function needsManualUrl(s: string): boolean {
  return s.includes("{") || s.includes("%7B");
}

// ====== AUTOGENERADOR de permutaciones ======
function buildOverrideCandidates(override: string, desde: string, hasta: string): string[] {
  // 1) primera pasada: reemplazo literal del secret
  const byReplace = replaceTpl(override, desde, hasta);

  // 2) si quedan llaves, fabricamos URLs “conocidas” de INVU
  const epochMs = { d: toEpochMillis(desde), h: toEpochMillis(hasta) };
  const epochS  = { d: toEpochSeconds(desde), h: toEpochSeconds(hasta) };

  const base = "https://api6.invupos.com/invuApiPos/index.php";

  // ordenesAllAdv: combinaciones
  const ord = (qs: Record<string, string | number>) => {
    const u = new URL(base);
    u.searchParams.set("r", "citas/ordenesAllAdv");
    for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, String(v));
    return u.toString();
  };

  // totalporfecha: combinaciones
  const tot = (qs: Record<string, string | number>) => {
    const u = new URL(base);
    u.searchParams.set("r", "citas/totalporfecha");
    for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, String(v));
    return u.toString();
  };

  const cands: string[] = [
    byReplace, // lo que diga el secret (si ya quedó sin llaves)
    // ordenesAllAdv (epoch MS / S, con y sin tipo)
    ord({ fini: epochMs.d, ffin: epochMs.h, tipo: "all" }),
    ord({ fini: epochMs.d, ffin: epochMs.h }),
    ord({ fini: epochS.d,  ffin: epochS.h,  tipo: "all" }),
    ord({ fini: epochS.d,  ffin: epochS.h }),
    // alias param names (some tenants)
    ord({ ini: epochMs.d, fin: epochMs.h, tipo: "all" }),
    ord({ ini: epochS.d,  fin: epochS.h,  tipo: "all" }),

    // totalporfecha (epoch MS / S)
    tot({ fini: epochMs.d, ffin: epochMs.h }),
    tot({ fini: epochS.d,  ffin: epochS.h }),
    // alias fechaIni/fechaFin (por si acaso)
    tot({ fechaIni: epochMs.d, fechaFin: epochMs.h }),
    tot({ fechaIni: epochS.d,  fechaFin: epochS.h }),
  ];

  // Si el secret no tenía llaves (byReplace “limpio”), ponlo primero;
  // si tenía llaves, ignóralo al principio.
  const cleanReplace = !needsManualUrl(byReplace);
  const final = cleanReplace ? cands : cands.slice(1);

  // Elimina duplicados conservando orden
  return Array.from(new Set(final));
}

// ================= normalización & DB =================
function normalizeItems(items: any[]) {
  const ventasByDia = new Map<string, number>();
  const detalleRows: any[] = [];

  for (const it of items ?? []) {
    const diaAgg = typeof it?.fecha === "string" && /^\d{4}-\d{2}-\d{2}/.test(it.fecha);
    const dia = diaAgg ? String(it.fecha).slice(0, 10) : pickDia(it as VentaDetalleIn);
    const total = toNumFrom(it, ["total","importe","monto","monto_total","grand_total"]);
    ventasByDia.set(dia, (ventasByDia.get(dia) ?? 0) + total);

    if (diaAgg) {
      detalleRows.push({
        idorden: crypto.randomUUID(), sucursal_id: SF_UUID,
        fecha_cierre: `${dia}T12:00:00Z`, estado: "completado",
        subtotal: total, itbms: 0, total,
      });
    } else {
      const subtotal = toNumFrom(it, ["subtotal"]);
      const itbms = toNumFrom(it, ["itbms"]);
      const fecha_cierre =
        (it as VentaDetalleIn).fecha_cierre ??
        ((it as VentaDetalleIn).fecha ? `${(it as VentaDetalleIn).fecha!.slice(0,10)}T12:00:00Z` : undefined) ??
        `${dia}T12:00:00Z`;

      detalleRows.push({
        idorden: (it as VentaDetalleIn).idorden ?? crypto.randomUUID(),
        sucursal_id: SF_UUID, fecha_cierre,
        estado: (it as VentaDetalleIn).estado ?? "completado",
        subtotal: subtotal || total, itbms, total,
      });
    }
  }

  return { ventasByDia, detalleRows };
}

async function upsertVentas(sb: SupabaseClient, ventasByDia: Map<string, number>): Promise<string | null> {
  if (ventasByDia.size === 0) return null;
  const ventasBulk = Array.from(ventasByDia.entries()).map(([dia, total]) => ({ sucursal_id: SF_UUID, fecha: dia, total }));
  const { error } = await sb.from("ventas").upsert(ventasBulk, { onConflict: "sucursal_id,fecha", ignoreDuplicates: true });
  return error ? (error.message ?? String(error)) : null;
}

async function upsertDetalle(sb: SupabaseClient, detalleRows: any[]): Promise<string | null> {
  if (detalleRows.length === 0) return null;
  const { error } = await sb.from("ventas_detalle").upsert(detalleRows, { onConflict: "idorden", ignoreDuplicates: true });
  if (!error) return null;
  const chunk = 500;
  for (let i = 0; i < detalleRows.length; i += chunk) {
    const part = detalleRows.slice(i, i + chunk);
    const { error: e2 } = await sb.from("ventas_detalle").upsert(part, { onConflict: "idorden", ignoreDuplicates: true });
    if (e2) return e2.message ?? String(e2);
  }
  return null;
}

async function fetchInvuAny(
  base: string, token: string, paths: string[], desde: string, hasta: string
): Promise<VentaDetalleIn[] | { error: string; attempts: Array<{ path: string; status: number }> }> {
  const attempts: Array<{ path: string; status: number }> = [];
  const b = stripTrailingSlash(base);
  for (const p of paths) {
    const u = `${b}${p}?desde=${desde}&hasta=${hasta}`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (r.ok) { try { const j = (await r.json()) as any[]; return Array.isArray(j) ? j : []; } catch { return []; } }
    attempts.push({ path: p, status: r.status });
    if (r.status !== 404) break;
  }
  return { error: "No INVU endpoint matched", attempts };
}

async function safePreview(r: Response) { try { return (await r.text()).slice(0, 200); } catch { return undefined; } }
async function safeArray(r: Response): Promise<any[]> {
  try {
    const j = await r.json();
    if (Array.isArray(j)) return j;
    if (j && Array.isArray((j as any).data)) return (j as any).data;
    return [];
  } catch { return []; }
}

async function insertDummyForDay(sb: SupabaseClient, dia: string) {
  const vent = { sucursal_id: SF_UUID, fecha: dia, total: 12.34 };
  const { error: ev } = await sb.from("ventas").upsert(vent, { onConflict: "sucursal_id,fecha", ignoreDuplicates: true });
  if (ev) return { ok: false, status: 500, error: ev.message ?? ev };
  const det = { idorden: crypto.randomUUID(), sucursal_id: SF_UUID, fecha_cierre: `${dia}T12:00:00Z`, estado: "completado", subtotal: 12.34, itbms: 0, total: 12.34 };
  const { error: ed } = await sb.from("ventas_detalle").upsert(det, { onConflict: "idorden", ignoreDuplicates: true });
  if (ed) return { ok: false, status: 500, error: ed.message ?? ed };
  return { ok: true };
}
