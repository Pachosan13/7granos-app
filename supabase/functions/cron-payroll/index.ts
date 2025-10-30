// supabase/functions/cron-payroll/index.ts
// Ejecuta el cálculo de planilla del período actual (12 y 26) o bajo `force:true`.
// Devuelve errores siempre serializados (nunca "[object Object]").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonError(err: unknown, debug = false, status = 500) {
  const e = err as any;
  const out = {
    ok: false,
    error: e?.message ?? String(e),
    details: e?.details ?? e?.cause ?? undefined,
    code: e?.code ?? undefined,
    stack: debug ? e?.stack : undefined,
  };
  return json(out, status);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const { force = false, debug = false } = await (async () => {
      try { return await req.json(); } catch { return {}; }
    })();

    const now = new Date();
    const day = now.getUTCDate();

    // Solo corre automático el 12 y 26; con `force:true` corre siempre.
    if (!force && !(day === 12 || day === 26)) {
      return json({
        ok: true,
        skipped: true,
        reason: "Not a payroll day (12/26 UTC)",
        todayUTC: now.toISOString(),
      });
    }

    // Client con service role para evitar RLS en RPC/tablas internas
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { "x-client-info": "cron-payroll" } },
    });

    // Llama el RPC (ajusta nombre/args si tu función requiere parámetros)
    const { data, error } = await supabase.rpc("hr_calcular_periodo_actual");
    if (error) {
      // Lanza con cause para que salga en `details`
      const e = new Error("RPC hr_calcular_periodo_actual failed", { cause: error });
      (e as any).code = error.code;
      throw e;
    }

    return json({
      ok: true,
      ran: true,
      ran_at: now.toISOString(),
      result: data ?? null,
    });
  } catch (err) {
    console.error("cron-payroll failed:", err);
    // Cuando llames con {"debug":true} verás el stack
    const wantsDebug =
      req.headers.get("x-debug") === "1" ||
      (await req.clone().json().catch(() => ({} as any))).debug === true;
    return jsonError(err, wantsDebug);
  }
});
