// sync-ventas-v7/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "sync-ventas-v7-2025-10-22-READY";
const SF_UUID = "1918f8f7-9b5d-4f6a-9b53-a953f82b71ad";

type VentaDetalleIn = {
  idorden: string;
  total?: number | string | null;
  subtotal?: number | string | null;
  itbms?: number | string | null;
  fecha_cierre?: string | null;
  fecha?: string | null;
  created_at?: string | null;
  estado?: string | null;
};

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "ping";
    const sucursal = url.searchParams.get("sucursal") ?? "";
    const desde = url.searchParams.get("desde") ?? "";
    const hasta = url.searchParams.get("hasta") ?? "";
    const source = url.searchParams.get("source") ?? "invu";

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (mode === "ping") {
      return j({ ok: true, mode, version: VERSION, now: new Date().toISOString() });
    }

    if (mode === "diag") {
      return j({
        ok: true, mode, version: VERSION,
        has_SUPABASE_URL: !!SUPABASE_URL,
        has_SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_ROLE,
        has_INVU_BASE_URL: !!Deno.env.get("INVU_BASE_URL"),
        has_SF_TOKEN: !!Deno.env.get("SF_TOKEN"),
      });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return j({ ok: false, version: VERSION, error: "faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { error: probeErr } = await sb.from("ventas").select("id", { head: true, count: "exact" }).limit(1);
    if (probeErr) return j({ ok: false, version: VERSION, step: "probe", error: probeErr.message ?? probeErr }, 500);

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

      const INVU_BASE_URL = Deno.env.get("INVU_BASE_URL")!;
      const SF_TOKEN = Deno.env.get("SF_TOKEN")!;
      const endpoint = `${stripTrailingSlash(INVU_BASE_URL)}/ventas?desde=${desde}&hasta=${hasta}`;

      const invuResp = await fetch(endpoint, { headers: { Authorization: `Bearer ${SF_TOKEN}` } });
      if (!invuResp.ok) return j({ ok: false, version: VERSION, step: "invu.fetch", status: invuResp.status, endpoint }, 502);

      const items: VentaDetalleIn[] = await invuResp.json().catch(() => []);
      const ventasByDia = new Map<string, number>();
      const detalleRows: any[] = [];

      for (const it of items) {
        const dia = pickDia(it);
        const total = toNum(it.total);
        ventasByDia.set(dia, (ventasByDia.get(dia) ?? 0) + total);
        detalleRows.push({
          idorden: it.idorden ?? crypto.randomUUID(),
          sucursal_id: SF_UUID,
          fecha_cierre: it.fecha_cierre ?? `${dia}T12:00:00Z`,
          estado: it.estado ?? "completado",
          subtotal: toNum(it.subtotal),
          itbms: toNum(it.itbms),
          total,
        });
      }

      if (ventasByDia.size > 0) {
        const ventasBulk = Array.from(ventasByDia.entries()).map(([dia, total]) => ({
          sucursal_id: SF_UUID, fecha: dia, total,
        }));
        const { error: ev } = await sb
          .from("ventas")
          .insert(ventasBulk, { onConflict: "sucursal_id,fecha", ignoreDuplicates: true });
        if (ev) return j({ ok: false, version: VERSION, step: "ventas.upsert", error: ev.message ?? ev }, 500);
      }

      if (detalleRows.length > 0) {
        const try1 = await sb
          .from("ventas_detalle")
          .insert(detalleRows, { onConflict: "idorden", ignoreDuplicates: true });
        if (try1.error) {
          const chunk = 500;
          for (let i = 0; i < detalleRows.length; i += chunk) {
            const part = detalleRows.slice(i, i + chunk);
            const { error } = await sb.from("ventas_detalle").insert(part);
            if (error) return j({ ok: false, version: VERSION, step: "detalle.insert", error: error.message ?? error }, 500);
          }
        }
      }

      return j({
        ok: true, version: VERSION, mode, note: "SYNC INVU SF OK",
        desde, hasta, ventas_dias: ventasByDia.size, detalle_rows: detalleRows.length,
      });
    }

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Number(n) : 0;
}
function pickDia(it: VentaDetalleIn): string {
  const raw = it.fecha_cierre ?? it.fecha ?? it.created_at ?? new Date().toISOString();
  return raw.slice(0, 10);
}
function enumerateDays(from: string, to: string): string[] {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  const out: string[] = [];
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
function stripTrailingSlash(s: string) {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

async function insertDummyForDay(sb: ReturnType<typeof createClient>, dia: string) {
  const venta = { sucursal_id: SF_UUID, fecha: dia, total: 12.34 };
  const r1 = await sb
    .from("ventas")
    .insert(venta, { onConflict: "sucursal_id,fecha", ignoreDuplicates: true });
  if (r1.error) return { ok: false, status: 500 as const, step: "ventas", error: r1.error.message ?? r1.error };

  const detalle = {
    idorden: crypto.randomUUID(),
    sucursal_id: SF_UUID,
    fecha_cierre: `${dia}T12:00:00Z`,
    estado: "completado",
    subtotal: 12.34, itbms: 0, total: 12.34,
  };
  const r2 = await sb
    .from("ventas_detalle")
    .insert(detalle, { onConflict: "idorden", ignoreDuplicates: true });
  if (r2.error) {
    const r2b = await sb.from("ventas_detalle").insert(detalle);
    if (r2b.error) return { ok: false, status: 500 as const, step: "ventas_detalle", error: r2b.error.message ?? r2b.error };
  }
  return { ok: true as const };
}
