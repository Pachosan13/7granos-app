// supabase/functions/invu-orders/index.ts
// Proxy de órdenes INVU por sucursal con soporte CORS y verificación deshabilitada.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { preflight, withCors } from "../_shared/cors.ts";

type BranchKey = "sf" | "museo" | "cangrejo" | "costa" | "central";

const BRANCH_ENV: Record<BranchKey, string> = {
  sf: "SF_TOKEN",
  museo: "MUSEO_TOKEN",
  cangrejo: "CANGREJO_TOKEN",
  costa: "COSTA_TOKEN",
  central: "CENTRAL_TOKEN",
};

const buildOrdersUrl = (fini: number, ffin: number): string => {
  const base = (Deno.env.get("INVU_ORDERS_BASE_URL") ?? "https://api6.invupos.com/invuApiPos").replace(/\/+$/, "");
  const template = (Deno.env.get("INVU_ORDERS_PATH") ?? "index.php?r=citas/ordenesAllAdv/fini/{F_INI}/ffin/{F_FIN}/tipo/all")
    .replace("{F_INI}", String(fini))
    .replace("{F_FIN}", String(ffin));
  return `${base}/${template.replace(/^\/+/, "")}`;
};

const ymdToEpoch = (ymd: string, endOfDay = false) => {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
  const dt = endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d, 0, 0, 0);
  return Math.floor(dt.getTime() / 1000);
};

const handler = async (req: Request): Promise<Response> => {
  const preflightResponse = preflight(req);
  if (preflightResponse) return preflightResponse;

  try {
    const url = new URL(req.url);
    const branch = (url.searchParams.get("branch") ?? "").toLowerCase() as BranchKey;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!branch || !(branch in BRANCH_ENV)) {
      return withCors({ error: "branch inválido. Usa: sf | museo | cangrejo | costa | central" }, { status: 400 });
    }
    if (!from || !to) {
      return withCors({ error: "Faltan parámetros from/to (YYYY-MM-DD)." }, { status: 400 });
    }

    const fini = ymdToEpoch(from, false);
    const ffin = ymdToEpoch(to, true);
    if (!Number.isFinite(fini) || !Number.isFinite(ffin) || fini > ffin) {
      return withCors({ error: "Rango de fechas inválido." }, { status: 400 });
    }

    const tokenEnv = BRANCH_ENV[branch];
    const token = Deno.env.get(tokenEnv);
    if (!token) {
      return withCors({ error: `No hay token configurado en ${tokenEnv}` }, { status: 500 });
    }

    const ordersUrl = buildOrdersUrl(fini, ffin);
    const res = await fetch(ordersUrl, {
      method: "GET",
      headers: {
        "Authorization": token,
        "Accept": "application/json",
      },
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      const note = text ? text.slice(0, 200) : "Respuesta vacía";
      const message = `INVU respondió ${res.status}. ${note}`;
      return withCors({ error: message }, { status: res.status || 502 });
    }

    if (!text) {
      return withCors([], { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }

    try {
      const json = JSON.parse(text);
      return withCors(json, {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    } catch {
      return withCors({ error: "INVU devolvió una respuesta no JSON.", preview: text.slice(0, 200) }, { status: 502 });
    }
  } catch (err) {
    return withCors({ error: `Error inesperado: ${String(err?.message ?? err)}` }, { status: 500 });
  }
};

Deno.serve({ onRequest: handler, verify: false });

export default handler;
