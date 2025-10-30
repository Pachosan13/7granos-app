import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing Supabase credentials for cron-payroll function");
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

Deno.serve(async () => {
  const startedAt = new Date();
  const day = startedAt.getDate();
  const month = startedAt.getMonth() + 1;
  const year = startedAt.getFullYear();

  console.log("[cron-payroll] Triggered", { iso: startedAt.toISOString(), day, month, year });

  try {
    if (![12, 26].includes(day)) {
      const skipPayload = { ok: true, skipped: true, reason: "Not payroll day" as const };
      console.log("[cron-payroll] Skipping execution", skipPayload);
      return new Response(JSON.stringify(skipPayload), {
        headers: { "content-type": "application/json" },
      });
    }

    const { error } = await supa.rpc("hr_calcular_periodo_actual", {});
    if (error) {
      console.error("[cron-payroll] RPC failed", error);
      throw error;
    }

    const payload = {
      ok: true,
      run: `${day}/${month}/${year}`,
      status: "Payroll generated" as const,
      executedAt: startedAt.toISOString(),
    };

    console.log("[cron-payroll] Payroll generated", payload);

    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron-payroll] Error", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
