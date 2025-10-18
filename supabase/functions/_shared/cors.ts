export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function preflight(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function withCors(body: BodyInit | null, init: ResponseInit = {}) {
  return new Response(body, { ...init, headers: { ...(init.headers || {}), ...corsHeaders } });
}
