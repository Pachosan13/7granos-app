import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleSyncVentasDetalle } from "../_shared/sync-ventas-detalle.ts";

Deno.serve({ onRequest: handleSyncVentasDetalle, verify: false });
