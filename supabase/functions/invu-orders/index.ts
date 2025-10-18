import { preflight, withCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const p = preflight(req);
  if (p) return p;
  try {
    const url = new URL(req.url);
    const branch = url.searchParams.get("branch") ?? "sf";
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";

    // TODO: aquí tu proxy real a INVU si lo tienes local
    return withCors(JSON.stringify({ ok: true, note: "Stub invu-orders ejecutado", branch, from, to }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return withCors(JSON.stringify({ ok: false, error: err?.message ?? "unknown" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
