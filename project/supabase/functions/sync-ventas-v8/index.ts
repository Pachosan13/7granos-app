// sync-ventas-v8.2 - DISCOVERY build
// Objetivo: descubrir el endpoint INVU correcto en TU tenant antes de sincronizar definitivamente.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const VERSION = "sync-ventas-v8.2-2025-10-22-DISCOVERY";

// Helpers
function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INVU_BASE_URL = Deno.env.get("INVU_BASE_URL") ?? "https://api6.invupos.com/invuApiPos";
const SF_TOKEN = Deno.env.get("INVU_SF_TOKEN") ?? "";
const INVU_SALES_PATH = Deno.env.get("INVU_SALES_PATH"); // opcional (legacy)
const INVU_SALES_URL = Deno.env.get("INVU_SALES_URL");   // opcional (override URL completa)

// Build headers INVU
function invuHeaders() {
  // Ajusta según tu tenant: algunos esperan "Authorization: Bearer", otros "token", otros "invu-token".
  // Arrancamos probando 3 variantes comunes.
  return [
    { name: "Authorization", value: `Bearer ${SF_TOKEN}` },
    { name: "token", value: SF_TOKEN },
    { name: "invu-token", value: SF_TOKEN },
  ];
}

// Intenta GET con múltiples headers alternativos; devuelve el primer resultado no-404
async function tryFetch(url: string) {
  const candidates = invuHeaders();
  const attempts: Array<{ header: string; status: number; preview: string }> = [];

  for (const h of candidates) {
    const res = await fetch(url, { headers: { [h.name]: h.value } });
    const text = await res.text();
    attempts.push({
      header: h.name,
      status: res.status,
      preview: text.slice(0, 200),
    });
    if (res.status !== 404) {
      return { ok: true, url, header: h.name, status: res.status, preview: text.slice(0, 500), attempts };
    }
  }
  return { ok: false, url, attempts };
}

// Lista de rutas “probables” (módulo/acción + combinaciones de parámetros) — solo para descubrir.
function candidateUrls(desdeISO: string, hastaISO: string) {
  // Épocas en ms y s
  const d = new Date(`${desdeISO}T00:00:00-05:00`).getTime(); // TZ Panamá
  const h = new Date(`${hastaISO}T23:59:59-05:00`).getTime();
  const d_ms = d, h_ms = h;
  const d_s = Math.floor(d_ms / 1000), h_s = Math.floor(h_ms / 1000);

  // Ojo: muchos tenants INVU exponen módulos y nombres distintos.
  // Vamos a cubrir familias comunes: ventas, citas, reportes, facturas, sales.
  const families = [
    "ventas/ordenesAllAdv",
    "ventas/porfecha",
    "ventas/ventasdiarias",
    "ventas/totalporfecha",
    "citas/ordenesAllAdv",
    "citas/totalporfecha",
    "reportes/ventas",
    "facturas/totalporfecha",
    "sales/GetSales",
    "sales/GetInvoices",
  ];

  const params = [
    `fini=${d_ms}&ffin=${h_ms}`,
    `fini=${d_s}&ffin=${h_s}`,
    `ini=${d_ms}&fin=${h_ms}`,
    `ini=${d_s}&fin=${h_s}`,
    `fechaIni=${d_ms}&fechaFin=${h_ms}`,
    `fechaIni=${d_s}&fechaFin=${h_s}`,
    `desde=${desdeISO}&hasta=${hastaISO}`,
    `ini=${desdeISO}&fin=${hastaISO}`,
    `fechaIni=${desdeISO}&fechaFin=${hastaISO}`,
  ];

  const baseR = (r: string) => `${INVU_BASE_URL.replace(/\/+$/, "")}/index.php?r=${encodeURIComponent(r)}`;

  const urls: string[] = [];
  for (const fam of families) {
    // con y sin &tipo=all / &format=json
    for (const p of params) {
      urls.push(`${baseR(fam)}&${p}&tipo=all&format=json`);
      urls.push(`${baseR(fam)}&${p}&format=json`);
      urls.push(`${baseR(fam)}&${p}`);
    }
  }

  // Si te habían dado algo como INVU_SALES_PATH (legacy)
  if (INVU_SALES_PATH && INVU_SALES_PATH.startsWith("/")) {
    urls.unshift(`${INVU_BASE_URL.replace(/\/+$/, "")}${INVU_SALES_PATH}?desde=${desdeISO}&hasta=${hastaISO}`);
  }

  // Si existe override completo (lo probamos con ms y con s)
  if (INVU_SALES_URL) {
    urls.unshift(
      INVU_SALES_URL
        .replace("{desde_epoch_ms}", String(d_ms))
        .replace("{hasta_epoch_ms}", String(h_ms))
        .replace("{desde_epoch}", String(d_s))
        .replace("{hasta_epoch}", String(h_s))
        .replace("{desde}", desdeISO)
        .replace("{hasta}", hastaISO),
    );
  }

  // Normalizamos “?” / “&”
  return urls.map(u => u.replace(/\?&/, "?").replace(/&&+/g, "&"));
}

serve(async (req) => {
  try {
    const u = new URL(req.url);
    const mode = u.searchParams.get("mode") ?? "ping";
    const sucursal = u.searchParams.get("sucursal") ?? "sf";
    const desde = u.searchParams.get("desde") ?? "2025-10-03";
    const hasta = u.searchParams.get("hasta") ?? "2025-10-04";
    const r = u.searchParams.get("r") ?? ""; // para modo proxy

    if (mode === "ping") {
      return j({ ok: true, mode, version: VERSION, now: new Date().toISOString() });
    }

    // Diagnóstico rápido de secrets
    if (mode === "diag") {
      return j({
        ok: true,
        mode,
        version: VERSION,
        has_SUPABASE_URL: !!SUPABASE_URL,
        has_SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY,
        has_INVU_BASE_URL: !!INVU_BASE_URL,
        has_SF_TOKEN: !!SF_TOKEN,
        has_INVU_SALES_PATH: !!INVU_SALES_PATH,
        has_INVU_SALES_URL: !!INVU_SALES_URL,
      });
    }

    // PROXY: te permite probar a mano cualquier r=<modulo/accion>&param=...
    if (mode === "proxy") {
      if (!r) return j({ ok: false, version: VERSION, error: "Falta parámetro r=<modulo/accion>" }, 400);
      const qs = [...u.searchParams.entries()]
        .filter(([k]) => k !== "mode" && k !== "r")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      const url = `${INVU_BASE_URL.replace(/\/+$/, "")}/index.php?r=${encodeURIComponent(r)}${qs ? `&${qs}` : ""}`;
      const probe = await tryFetch(url);
      return j({ ok: probe.ok, version: VERSION, url, ...probe });
    }

    // EXPLORE: barrido automático de rutas conocidas con varias combinaciones de parámetros
    if (mode === "explore") {
      const urls = candidateUrls(desde, hasta);
      const results: any[] = [];
      for (const url of urls) {
        const res = await tryFetch(url);
        results.push(res);
      }

      // Resumen útil: primeras 10 rutas “prometedoras” != 404
      const promising = results.filter(r => (r as any).ok).slice(0, 10);
      return j({
        ok: true,
        version: VERSION,
        desde,
        hasta,
        tested: results.length,
        promising: promising.map(p => ({
          url: (p as any).url,
          status: (p as any).status,
          header: (p as any).header,
          preview: (p as any).preview,
        })),
        // Si necesitas ver TODO, quita el comentario:
        // results
      });
    }

    // INSERT de prueba local (sin INVU) — sigue disponible por si necesitas verificar DB
    if (mode === "insert") {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return j({ ok: false, version: VERSION, error: "faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY" }, 500);
      }
      if (!sucursal || !desde || !hasta) {
        return j({ ok: false, version: VERSION, error: "Faltan parámetros sucursal|desde|hasta" }, 400);
      }
      if (sucursal !== "sf") {
        return j({ ok: false, version: VERSION, error: "Solo SF tiene token vigente" }, 401);
      }
      // No hacemos writes aquí para no contaminar: esto era del build previo.
      return j({ ok: true, version: VERSION, mode, note: "v8.2 discovery: insert no-op" });
    }

    // SYNC real — en v8.2 Discovery NO escribimos a DB; solo descubrimos endpoint y devolvemos cuál sirve.
    if (mode === "sync") {
      if (!sucursal || !desde || !hasta) {
        return j({ ok: false, version: VERSION, error: "Faltan parámetros sucursal|desde|hasta" }, 400);
      }
      if (sucursal !== "sf") {
        return j({ ok: false, version: VERSION, error: "Solo SF tiene token vigente" }, 401);
      }

      // 1) Si hay override completo, úsalo primero (ms / s / yyyy-mm-dd)
      const urls = candidateUrls(desde, hasta);
      const tried: any[] = [];
      for (const url of urls) {
        const res = await tryFetch(url);
        tried.push(res);
        if ((res as any).ok) {
          // Éxito de descubrimiento — no guardamos, solo te decimos qué URL funcionó
          return j({
            ok: true,
            version: VERSION,
            step: "invu.fetch.match",
            used: { url: (res as any).url, header: (res as any).header, status: (res as any).status },
            preview: (res as any).preview,
            note: "Usa este 'used.url' como INVU_SALES_URL (si trae 401/403, valida el header elegido)",
          });
        }
      }
      // Si nada funcionó:
      return j({
        ok: false,
        version: VERSION,
        step: "invu.fetch.no-match",
        message: "No se encontró un endpoint válido en este tenant con los parámetros probados",
        sample: tried.slice(0, 10), // primeras 10 para no explotar el payload
      }, 502);
    }

    // fallback
    return j({ ok: true, version: VERSION, mode, note: "Nada que hacer" });
  } catch (e) {
    return j({ ok: false, version: VERSION, error: String(e) }, 500);
  }
});
