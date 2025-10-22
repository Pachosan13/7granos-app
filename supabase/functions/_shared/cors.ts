export function withCors(handler: (req: Request) => Promise<Response> | Response) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
    const r = await handler(req);
    const h = new Headers(r.headers);
    Object.entries(corsHeaders()).forEach(([k,v]) => h.set(k, v));
    return new Response(r.body, { status: r.status, headers: h });
  };
}
export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
