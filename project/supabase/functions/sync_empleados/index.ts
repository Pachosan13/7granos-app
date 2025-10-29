// Edge Function: sync-empleados (v4-diag)
// - Intenta v6 movimientos; si falla o retorna vacío, cae a catálogo empleados.
// - Upsert por (sucursal_id, invu_employee_id).
// - Devuelve diagnóstico completo: urlUsed, status, total_raw, sample, mode.
// - Admite flags en body: { dry_run?: boolean, debug?: boolean, force?: "mov" | "empleados" }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "v4-diag";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INVU_TOKENS_JSON = Deno.env.get("INVU_TOKENS_JSON") ?? "{}";
const INVU_BASE_RAW =
  Deno.env.get("INVU_BASE_URL") ?? "https://api6.invupos.com/invuApiPos/index.php?r=";

function buildUrl(pathWithQuery: string) {
  // normaliza base para concatenar path con o sin ?r=
  let base = INVU_BASE_RAW;
  if (!base.includes("?r=")) {
    // si la base terminara en 'index.php' sin '?r=', se lo agregamos
    base = base.replace(/\/?$/, "");
    if (!base.endsWith("?r=")) base = base + (base.includes("?") ? "" : "?r=");
  }
  const rest = pathWithQuery.replace(/^\?r=/, "");
  return `${base}${rest}`;
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function fetchInvu(path: string, token: string) {
  const url = buildUrl(path);
  const res = await fetch(url, {
    headers: { AUTHORIZATION: token, accept: "application/json" },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch (_) {
    // puede venir HTML si el token o la ruta están mal
  }
  return { url, status: res.status, text, data };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Only POST" }, 405);
    const body = await req.json().catch(() => ({}));
    const sucursal_id = body?.sucursal_id as string | undefined;
    const dry_run = Boolean(body?.dry_run);
    const debug = Boolean(body?.debug);
    const force: "mov" | "empleados" | undefined = body?.force;

    if (!sucursal_id) return json({ ok: false, error: "Falta sucursal_id" }, 400);

    const tokens = JSON.parse(INVU_TOKENS_JSON || "{}");
    const token = tokens[sucursal_id]?.token as string | undefined;
    if (!token) return json({ ok: false, error: `No hay token para sucursal_id=${sucursal_id}` }, 400);

    // 1) intento A: movimientos v6 (ventana amplia)
    const start_date = 1609459200; // 2021-01-01
    const end_date = Math.floor(Date.now() / 1000);
    const tryMov = async () =>
      await fetchInvu(`empleados/movimientos/fini/${start_date}/ffin/${end_date}`, token);

    // 2) intento B: catálogo de empleados
    const tryEmps = async () => await fetchInvu(`empleados/empleados&limit=500`, token);

    let first = { url: "", status: 0, text: "", data: null as any };
    let second = { url: "", status: 0, text: "", data: null as any };
    let mode: "mov" | "empleados" = "mov";
    let empleados: any[] = [];

    if (force === "empleados") {
      first = await tryEmps();
      mode = "empleados";
    } else if (force === "mov") {
      first = await tryMov();
      mode = "mov";
    } else {
      // estrategia por defecto: intenta mov primero
      first = await tryMov();
      mode = "mov";
    }

    // si mov falla o no trae data útil, cae a empleados
    const extractMov = (d: any) => (Array.isArray(d?.data) ? d.data : []);
    const extractEmp = (d: any) => (Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);

    if (mode === "mov") {
      empleados = extractMov(first.data);
      if (first.status !== 200 || empleados.length === 0) {
        second = await tryEmps();
        empleados = extractEmp(second.data);
        mode = "empleados";
      }
    } else {
      empleados = extractEmp(first.data);
    }

    const total_raw = Array.isArray(empleados) ? empleados.length : 0;
    const sample = (empleados || []).slice(0, 5).map((e: any) => ({
      invu_employee_id: String(e?.id ?? ""),
      nombre: [e?.nombres, e?.apellidos].filter(Boolean).join(" ").trim(),
    }));

    if (dry_run) {
      return json({
        ok: true,
        version: VERSION,
        mode,
        first: { url: first.url, status: first.status },
        second: second.url ? { url: second.url, status: second.status } : null,
        total_raw,
        sample,
      });
    }

    // Mapeo para upsert
    const rows =
      (empleados || []).map((e: any) => ({
        sucursal_id,
        invu_employee_id: String(e?.id ?? ""),
        nombre: [e?.nombres, e?.apellidos].filter(Boolean).join(" ").trim() || null,
        email: e?.email ?? null,
        last_synced_at: new Date().toISOString(),
      })) ?? [];

    if (rows.length === 0) {
      return json({
        ok: true,
        version: VERSION,
        mode,
        first: { url: first.url, status: first.status },
        second: second.url ? { url: second.url, status: second.status } : null,
        upserted: 0,
        total_raw,
        sample,
        note: "No hubo filas para upsert",
      });
    }

    const { error: upErr } = await supa
      .from("hr_empleado")
      .upsert(rows, { onConflict: "sucursal_id,invu_employee_id" });

    if (upErr) return json({ ok: false, error: upErr.message }, 500);

    return json({
      ok: true,
      version: VERSION,
      mode,
      upserted: rows.length,
      total_raw,
      sample,
      debug: debug
        ? {
            first: { url: first.url, status: first.status },
            second: second.url ? { url: second.url, status: second.status } : null,
          }
        : undefined,
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
