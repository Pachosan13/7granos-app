import { preflight, withCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const p = preflight(req);
  if (p) return p;
  try {
    const url = new URL(req.url);
    const desde = url.searchParams.get("desde") ?? "";
    const hasta = url.searchParams.get("hasta") ?? "";

    // TODO: aquí tu lógica de sync si la tienes local
    return withCors(JSON.stringify({ ok: true, note: "Stub sync-ventas ejecutado", desde, hasta }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return withCors(JSON.stringify({ ok: false, error: err?.message ?? "unknown" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
