/**
 * ext-canal-ingest (v2) — Upsert por ID determinístico
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RowIn = {
  proveedor_id?: string | null;
  sucursal_id?: string | null;
  fecha?: string | number | null;
  referencia?: string | null;
  subtotal?: number | string | null;
  itbms?: number | string | null;
  total?: number | string | null;
  canal?: string | null;
  raw?: any;
};

function N(x: any, def = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}
function toYMD(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const num = Number(s);
    const ms = s.length > 10 ? num : num * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}
function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Hash SHA-256 -> hex
async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ID determinístico basado en (proveedor_id|sucursal_id|fecha|referencia|canal)
async function makeDeterministicId(r: {
  proveedor_id: string | null;
  sucursal_id: string | null;
  fecha: string;
  referencia: string;
  canal: string;
}) {
  const key = [
    r.proveedor_id ?? "",
    r.sucursal_id ?? "",
    r.fecha ?? "",
    r.referencia ?? "",
    r.canal ?? "",
  ].join("|");
  // usa los primeros 32 chars del hash para formar un UUID-like estable
  const h = await sha256Hex(key);
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const input = Array.isArray(body?.data)
      ? (body.data as RowIn[])
      : (body?.data ? [body.data as RowIn] : (Array.isArray(body) ? (body as RowIn[]) : []));

    if (!Array.isArray(input) || input.length === 0) {
      return j(400, { ok: false, error: "payload vacío: espera { data: [...] }" });
    }

    const url = Deno.env.get("SB_URL");
    const srv = Deno.env.get("SB_SERVICE_ROLE");
    if (!url || !srv) {
      return j(500, { ok: false, error: "Faltan secrets SB_URL o SB_SERVICE_ROLE" });
    }
    const supabase = createClient(url, srv);

    // Normaliza y construye IDs determinísticos
    const normalized = input.map((r) => {
      const fecha = toYMD(r.fecha);
      const referencia = (r.referencia ?? "").toString().trim();
      const canal = (r.canal ?? "pedidosya").toString().trim().toLowerCase();
      return {
        proveedor_id: r.proveedor_id ?? null,
        sucursal_id: r.sucursal_id ?? null,
        fecha,
        referencia,
        subtotal: N(r.subtotal),
        itbms: N(r.itbms),
        total: N(r.total),
        canal,
        raw: r.raw ?? null,
      };
    });

    const bad = normalized.find((m) => !m.fecha);
    if (bad) {
      return j(400, { ok: false, error: "Algún registro no tiene fecha válida (YYYY-MM-DD/ISO/epoch)" });
    }

    const withIds = await Promise.all(
      normalized.map(async (m) => ({
        id: await makeDeterministicId({
          proveedor_id: m.proveedor_id,
          sucursal_id: m.sucursal_id,
          fecha: m.fecha!, // ya validado
          referencia: m.referencia ?? "",
          canal: m.canal ?? "",
        }),
        ...m,
      }))
    );

    // Upsert por id (PK)
    const { error } = await supabase
      .from("ext_ventas_canal")
      .upsert(withIds, { onConflict: "id" });

    if (error) {
      return j(500, { ok: false, error: error.message ?? String(error) });
    }

    return j(200, { ok: true, upserted: withIds.length });
  } catch (e) {
    console.error("ext-canal-ingest error:", e);
    return j(500, { ok: false, error: String(e) });
  }
});
