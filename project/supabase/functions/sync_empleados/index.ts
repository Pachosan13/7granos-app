// v3.1 — diagnósticos + auto-refresh de token
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INVU_BASE_RAW =
  Deno.env.get("INVU_BASE_URL") ?? "https://api6.invupos.com/invuApiPos/index.php";
const TOKENS_RAW = Deno.env.get("INVU_TOKENS_JSON") ?? "{}";
const CREDS_RAW  = Deno.env.get("INVU_CREDENTIALS_JSON") ?? "{}";

function buildUrl(pathWithQuery: string) {
  // admite con o sin ?r=
  const hasR = /\?r=/.test(INVU_BASE_RAW);
  const rest = pathWithQuery.replace(/^\?r=/, "");
  return `${INVU_BASE_RAW}${hasR ? "" : "?r="}${rest}`;
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function fetchInvuEmployeesByMov(token: string) {
  // rango amplio: 2021-01-01 a 2030-01-01
  const url = buildUrl("empleados/movimientos/fini/1609459200/ffin/1893456000");
  return await fetch(url, {
    headers: { "AUTHORIZATION": token, "accept": "application/json" },
  });
}

async function userAuth(username: string, password: string) {
  const url = buildUrl("userAuth");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ grant_type: "authorization", username, password }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`userAuth ${res.status}: ${text}`);
  const j = JSON.parse(text);
  const token = j?.authorization ?? j?.Authorization ?? j?.auth ?? null;
  if (!token) throw new Error(`userAuth ok pero sin token: ${text}`);
  return token as string;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Only POST" }, 405);
    const body = await req.json().catch(() => ({}));
    const { sucursal_id, dry_run, debug, force } = body ?? {};

    const tokens = JSON.parse(TOKENS_RAW || "{}");
    const creds  = JSON.parse(CREDS_RAW  || "{}");

    if (debug) {
      return json({
        ok: true,
        debug: {
          invu_base_url: INVU_BASE_RAW,
          sucursal_id,
          tokens_keys: Object.keys(tokens),
          has_token: Boolean(tokens?.[sucursal_id]?.token),
          has_creds: Boolean(creds?.[sucursal_id]),
          force
        }
      });
    }

    if (!sucursal_id) return json({ ok: false, error: "Falta sucursal_id" }, 400);

    let token: string | undefined = tokens?.[sucursal_id]?.token;

    // si nos piden forzar refresh o no hay token, intenta userAuth
    if (!token || force === "auth") {
      const c = creds?.[sucursal_id];
      if (!c) return json({ ok: false, error: `No hay token ni credenciales para sucursal_id=${sucursal_id}` }, 400);
      token = await userAuth(c.username, c.password);
    }

    // 1er intento al endpoint de movimientos
    let res = await fetchInvuEmployeesByMov(token);
    if (res.status === 401 || res.status === 403) {
      // reintenta con userAuth (token vencido)
      const c = creds?.[sucursal_id];
      if (!c)
        return json({ ok: false, error: `Token inválido y no hay credenciales para refresh (sucursal_id=${sucursal_id})` }, 400);
      token = await userAuth(c.username, c.password);
      res = await fetchInvuEmployeesByMov(token);
    }

    const text = await res.text();
    if (!res.ok) return json({ ok: false, error: `INVU ${res.status}: ${text}` }, 502);

    const parsed = JSON.parse(text);
    const data = Array.isArray(parsed?.data) ? parsed.data : [];
    const total_raw = data.length;
    const sample = data.slice(0, 5);

    if (dry_run) {
      return json({ ok: true, sucursal_id, total_raw, sample });
    }

    if (total_raw === 0) {
      return json({ ok: true, sucursal_id, upserted: 0, note: "sin empleados" });
    }

    const rows = data.map((e: any) => ({
      sucursal_id,
      invu_employee_id: String(e.id ?? ""),
      nombre: [e.nombres, e.apellidos].filter(Boolean).join(" ").trim() || String(e.id ?? ""),
      email: e.email ?? null,
      activo: true,
      last_synced_at: new Date().toISOString(),
    }));

    const { error: upErr } = await supa
      .from("hr_empleado")
      .upsert(rows, { onConflict: "sucursal_id,invu_employee_id" });

    if (upErr) return json({ ok: false, error: upErr.message }, 500);

    return json({ ok: true, sucursal_id, upserted: rows.length, total_raw, sample });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
