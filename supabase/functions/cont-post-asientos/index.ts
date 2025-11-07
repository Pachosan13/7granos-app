// supabase/functions/cont-post-asientos/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function j(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { desde, hasta, sucursal } = body ?? {};
    if (!desde || !hasta) return j(400, { ok: false, error: "Faltan desde/hasta" });

    const url = Deno.env.get("SERVICE_URL") || Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return j(500, { ok: false, error: "Faltan SERVICE_URL/SERVICE_ROLE_KEY" });

    const sb = createClient(url, key);

    // 🔁 Aquí agregas tu lógica real:
    // - Leer invu_ventas (por rango/sucursal)
    // - Agrupar y crear cont_journal + cont_entry (o llamar una RPC)
    // Ejemplo si tuvieras una RPC:
    // const { error } = await sb.rpc('cont_post_asientos', { p_desde: desde, p_hasta: hasta, p_sucursal: sucursal });
    // if (error) throw error;

    return j(200, { ok: true, posted: `rango ${desde}..${hasta}`, sucursal: sucursal ?? 'todas' });
  } catch (e) {
    console.error(e);
    return j(500, { ok: false, error: String(e) });
  }
});
