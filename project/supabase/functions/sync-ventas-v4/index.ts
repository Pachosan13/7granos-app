import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleSyncVentasDetalle } from "../_shared/sync-ventas-detalle.ts";
import { withCors } from "../_shared/cors.ts";

const handler = async (req: Request): Promise<Response> => {
  try {
    return await handleSyncVentasDetalle(req);
  } catch (err) {
    return withCors({ error: `sync-ventas-v4 delegación falló: ${String(err?.message ?? err)}` }, { status: 500 });
  }
};

Deno.serve({ onRequest: handler, verify: false });

export default handler;
