// v3.1 DIAG — no escribe, solo diagnóstico de tokens, auth y movimientos
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const INVU_BASE_URL = Deno.env.get("INVU_BASE_URL") ?? "https://api6.invupos.com/invuApiPos/index.php";
const TOKENS_RAW    = Deno.env.get("INVU_TOKENS_JSON") ?? "{}";
const CREDS_RAW     = Deno.env.get("INVU_CREDENTIALS_JSON") ?? "{}";

function buildUrl(pathWithQuery: string) {
  const hasR = /\?r=/.test(INVU_BASE_URL);
  const rest = pathWithQuery.replace(/^\?r=/, "");
  return `${INVU_BASE_URL}${hasR ? "" : "?r="}${rest}`;
}

async function userAuth(username: string, password: string) {
  const url = buildUrl("userAuth");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ grant_type: "authorization", username, password }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function fetchMovimientos(token: string) {
  // 2021-01-01 a 2030-01-01
  const url = buildUrl("empleados/movimientos/fini/1609459200/ffin/1893456000");
  const res = await fetch(url, { headers: { AUTHORIZATION: token, accept: "application/json" } });
  const text = await res.text();
  return { status: res.status, text };
}

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return j({ error: "Only POST" }, 405);
    const { sucursal_id } = await req.json();
    if (!sucursal_id) return j({ ok: false, error: "Falta sucursal_id" }, 400);

    const tokens = JSON.parse(TOKENS_RAW || "{}");
    const creds  = JSON.parse(CREDS_RAW  || "{}");

    const diag: any = {
      invu_base_url: INVU_BASE_URL,
      sucursal_id,
      tokens_keys: Object.keys(tokens),
      has_token: Boolean(tokens?.[sucursal_id]?.token),
      has_creds: Boolean(creds?.[sucursal_id]),
    };

    // 1) Si no hay token, intenta auth
    let token = tokens?.[sucursal_id]?.token as string | undefined;
    if (!token && creds?.[sucursal_id]) {
      const { username, password } = creds[sucursal_id];
      const a = await userAuth(username, password);
      diag.userAuth = { status: a.status, body_sample: a.text.slice(0, 160) };
      try {
        const j = JSON.parse(a.text);
        token = j?.authorization || j?.Authorization || j?.auth || undefined;
      } catch { /* ignore */ }
    } else if (!token && !creds?.[sucursal_id]) {
      diag.userAuth = "sin credenciales";
    }

    // 2) Probar movimientos con (posible) token
    if (!token) return j({ ok: false, diag, error: "Sin token para probar movimientos" }, 400);

    const mov = await fetchMovimientos(token);
    diag.movimientos = { status: mov.status, body_sample: mov.text.slice(0, 200) };

    let total_raw = 0;
    try {
      const parsed = JSON.parse(mov.text);
      total_raw = Array.isArray(parsed?.data) ? parsed.data.length : 0;
      diag.mov_sample = Array.isArray(parsed?.data) ? parsed.data.slice(0, 5) : parsed;
    } catch (e) {
      diag.mov_parse_error = String(e);
    }

    return j({ ok: true, total_raw, diag });
  } catch (e: any) {
    return j({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
