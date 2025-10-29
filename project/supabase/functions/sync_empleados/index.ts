// ping v1 — solo eco para comprobar despliegue y lectura de secrets/body
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const INVU_BASE_URL = Deno.env.get("INVU_BASE_URL") ?? null;
const TOKENS = Deno.env.get("INVU_TOKENS_JSON") ?? "";
const CREDS  = Deno.env.get("INVU_CREDENTIALS_JSON") ?? "";

Deno.serve(async (req) => {
  let body:any = null;
  try { body = await req.json(); } catch { body = null; }

  return new Response(
    JSON.stringify({
      version: "ping-v1",
      method: req.method,
      contentType: req.headers.get("content-type"),
      body,
      has_env: {
        INVU_BASE_URL: !!INVU_BASE_URL,
        INVU_TOKENS_JSON: TOKENS.length > 2,
        INVU_CREDENTIALS_JSON: CREDS.length > 2,
      },
      tokens_keys: (() => { try { return Object.keys(JSON.parse(TOKENS)); } catch { return []; } })(),
    }),
    { headers: { "content-type": "application/json" } }
  );
});
