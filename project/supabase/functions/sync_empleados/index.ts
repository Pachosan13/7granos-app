// Edge Function: sync-empleados (v3, con diagnóstico detallado)
// - Intenta v6 movimientos; si viene vacío, cae a catálogo empleados.
// - Upsert por (sucursal_id, invu_employee_id).
// - Devuelve: upserted, urlUsed, mode, sample (primeros 5), total_raw.
// - Soporta dry_run para probar sin escribir (dry_run=true).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "v3-diagnostic";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INVU_TOKENS_JSON = Deno.env.get("INVU_TOKENS_JSON") ?? "{}";
const INVU_BASE_RAW =
  Deno.env.get("INVU_BASE_URL") ?? "https://api6.invupos.com/invuApiPos/index.php";

// normaliza INVU_BASE para poder concatenar bien los path/query
function buildUrl(pathWithQuery: string) {
  // Soportar bases tipo ".../index.php" o ".../index.php?r="
  if (INVU_BASE_RAW.includes("?r=")) {
    // base ya incluye ?r= → solo concatenamos el resto sin '?r='
    const rest = pathWithQuery.replace(/^\?r=/, "");
    return `${INVU_BASE_RAW}${rest.startsWith("empleados/") ? "" : ""}${rest}`;
  }
  // base sin ?r= → añadimos ?r=
  const rest = pathWithQuery.replace(/^\?r=/, "");
  return `${INVU_BASE_RAW}?r=${rest}`;
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function J(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

type EmpleadoINVU = {
  id?: number | string;
  nombres?: string | null;
  apellidos?: string | null;
  email?: string | null;
};

function normalize(sucursal_id: string, list: EmpleadoINVU[]) {
  const now = new Date().toISOString();
  return list
    .map((e) => {
      const invuId = e?.id == null ? null : String(e.id);
      const nombre =
        [e?.nombres, e?.apellidos].filter(Boolean).join(" ").trim() || null;
      return {
        sucursal_id,
        invu_employee_id: invuId,
        nombre,
        email: e?.email ?? null,
        activo: true,
        last_synced_at: now,
      };
    })
    .filter((r) => r.invu_employee_id && r.nombre);
}

async function fetchJSON(url: string, token: string) {
  const res = await fetch(url, {
    headers: { AUTHORIZATION: token, accept: "application/json" },
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw text */ }
  return { ok: res.ok, status: res.status, text, json };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return J({ error: "Only POST" }, 405);

    const body = await req.json().catch(() => ({}));
    const sucursal_id = body?.sucursal_id as string | undefined;
    const dry_run = Boolean(body?.dry_run);

    if (!sucursal_id) return J({ ok: false, error: "Falta sucursal_id", version: VERSION }, 400);

    const tokens = JSON.parse(INVU_TOKENS_JSON || "{}");
    const token: string | undefined = tokens[sucursal_id]?.token;
    if (!token) return J({ ok: false, error: `No hay token para sucursal_id=${sucursal_id}`, version: VERSION }, 400);

    // 1) Intento por movimientos (amplio rango por si acaso)
    const start_date = 1609459200; // 2021-01-01
    const end_date = Math.floor(Date.now() / 1000);
    const urlMov = buildUrl(`empleados/movimientos/fini/${start_date}/ffin/${end_date}`);
    const mov = await fetchJSON(urlMov, token);

    let mode = "movimientos";
    let empleados: EmpleadoINVU[] = Array.isArray(mov.json?.data) ? mov.json.data : [];
    let urlUsed = urlMov;
    let rawStatus = mov.status;
    let rawOk = mov.ok;

    // 2) Fallback catálogo si viene vacío o error
    if (!rawOk || !empleados.length) {
      const urlCat = buildUrl("empleados/empleados&limit=500");
      const cat = await fetchJSON(urlCat, token);
      mode = "empleados";
      urlUsed = urlCat;
      rawStatus = cat.status;
      rawOk = cat.ok;
      empleados = Array.isArray(cat.json?.data) ? cat.json.data : [];

      if (!rawOk) {
        return J({
          ok: false,
          version: VERSION,
          step: "catalog",
          status: rawStatus,
          urlUsed,
          base: INVU_BASE_RAW,
          errorText: cat.text?.slice(0, 500),
        }, 502);
      }
    }

    const total_raw = empleados.length;
    const rows = normalize(sucursal_id, empleados);
    const sample = rows.slice(0, 5).map((r) => ({
      invu_employee_id: r.invu_employee_id,
      nombre: r.nombre,
    }));

    if (dry_run) {
      return J({
        ok: true,
        version: VERSION,
        sucursal_id,
        mode,
        urlUsed,
        base: INVU_BASE_RAW,
        total_raw,
        to_upsert: rows.length,
        sample,
        dry_run: true,
      });
    }

    let upserted = 0;
    if (rows.length) {
      const { error } = await supa
        .from("hr_empleado")
        .upsert(rows, { onConflict: "sucursal_id,invu_employee_id" });
      if (error) return J({ ok: false, version: VERSION, error: error.message, urlUsed, base: INVU_BASE_RAW }, 500);
      upserted = rows.length;
    }

    return J({
      ok: true,
      version: VERSION,
      sucursal_id,
      mode,
      urlUsed,
      base: INVU_BASE_RAW,
      total_raw,
      upserted,
      sample,
    });
  } catch (err: any) {
    return J({ ok: false, version: VERSION, error: err?.message ?? String(err) }, 500);
  }
});
