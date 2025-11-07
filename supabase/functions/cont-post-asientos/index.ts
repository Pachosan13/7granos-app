// Minimal: toma ventas de invu_ventas y crea asientos en cont_journal/cont_entry
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

    // 1) Agrega aquí tu lógica de mapeo cuentas ↔ ventas.
    //    Ejemplo: ingresos (4-01), ITBMS (2-01), caja/bancos (1-01) según medio de pago…

    // 2) Crea una “poliza” (journal) y entradas (entries) resumidas por día/sucursal
    //    Aquí llamo a una RPC si ya la tienes, o haz inserts directos:
    //
    //    await sb.rpc('cont_post_asientos', { p_desde: desde, p_hasta: hasta, p_sucursal: sucursal });
    //
    //    o bien:
    //    await sb.from('cont_journal').insert([...]); luego cont_entry [...];

    // Placeholder OK:
    return j(200, { ok: true, posted: `rangos ${desde}..${hasta}`, sucursal: sucursal ?? 'todas' });
  } catch (e) {
    console.error(e);
    return j(500, { ok: false, error: String(e) });
  }
});
