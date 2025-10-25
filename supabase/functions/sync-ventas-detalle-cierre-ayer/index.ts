import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

serve(async (req) => {
  try {
    // calcula “ayer” en zona horaria Panamá
    const tz = "America/Panama";
    const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const ayer = new Date(nowLocal);
    ayer.setDate(nowLocal.getDate() - 1);
    const desde = ymd(ayer);
    const hasta = ymd(ayer);

    // reusa el endpoint de detalle pasándole ayer->ayer
    const origin = new URL(req.url).origin;
    const url = `${origin}/sync-ventas-detalle?desde=${desde}&hasta=${hasta}`;

    const auth = req.headers.get("authorization") ?? "";
    const resp = await fetch(url, {
      method: "POST",
      headers: { "authorization": auth, "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const text = await resp.text();
    try {
      const json = JSON.parse(text);
      return new Response(JSON.stringify({ success: resp.ok, desde, hasta, proxied: "sync-ventas-detalle", result: json }), {
        status: resp.status,
        headers: { "content-type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ success: resp.ok, desde, hasta, proxied: "sync-ventas-detalle", raw: text }), {
        status: resp.status,
        headers: { "content-type": "application/json" },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
