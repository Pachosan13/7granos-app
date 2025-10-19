// supabase/functions/invu-marcaciones/index.ts
// Edge Function oficial para obtener marcaciones de INVU por sucursal.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { preflight, withCors } from "../_shared/cors.ts";

type BranchKey = "sf" | "museo" | "cangrejo" | "costa" | "central";

const TOKEN_ENV: Record<BranchKey, string> = {
  sf: "SF_TOKEN",
  museo: "MUSEO_TOKEN",
  cangrejo: "CANGREJO_TOKEN",
  costa: "COSTA_TOKEN",
  central: "CENTRAL_TOKEN",
};

const PANAMA_TZ = "America/Panama";
const DEFAULT_TIMEOUT = Number(Deno.env.get("INVU_MARCACIONES_TIMEOUT_MS") ?? "15000");
const MAX_RETRIES = 2;

const pad = (v: number) => String(v).padStart(2, "0");

const tzDate = (date: Date, tz: string) => new Date(date.toLocaleString("en-US", { timeZone: tz }));

const parseDateToEpochRange = (ymd: string): { fini: number; ffin: number } => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error("date debe ser YYYY-MM-DD");
  }

  const [y, m, d] = ymd.split("-").map(Number);
  const startIso = `${y}-${pad(m)}-${pad(d)}T00:00:00-05:00`;
  const endIso = `${y}-${pad(m)}-${pad(d)}T23:59:59-05:00`;
  const fini = Math.floor(new Date(startIso).getTime() / 1000);
  const ffin = Math.floor(new Date(endIso).getTime() / 1000);
  return { fini, ffin };
};

const buildInvuUrl = (fini: number, ffin: number) => {
  const base = (Deno.env.get("INVU_MARCACIONES_BASE_URL") ?? "https://api6.invupos.com/invuApiPos").replace(/\/+$/, "");
  return `${base}/index.php?r=empleados/movimientos/fini/${fini}/ffin/${ffin}`;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithRetry = async (url: string, token: string, timeoutMs: number) => {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < MAX_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": token,
          "Accept": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status >= 500 && res.status < 600 && attempt + 1 < MAX_RETRIES) {
        await sleep(250 * (attempt + 1));
        attempt += 1;
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));
      attempt += 1;
      if (attempt >= MAX_RETRIES) break;
      await sleep(250 * attempt);
    }
  }

  throw lastError ?? new Error("INVU fetch failed");
};

const handler = async (req: Request): Promise<Response> => {
  const preflightResponse = preflight(req);
  if (preflightResponse) return preflightResponse;

  try {
    const url = new URL(req.url);
    const branchParam = (url.searchParams.get("branch") ?? "").toLowerCase();
    const branch = branchParam as BranchKey;
    const date = url.searchParams.get("date");
    const finiParam = url.searchParams.get("fini");
    const ffinParam = url.searchParams.get("ffin");

    if (!branchParam || !(branchParam in TOKEN_ENV)) {
      return withCors({
        ok: false,
        branch: branchParam,
        error: "Parámetro branch inválido. Usa sf|museo|cangrejo|costa|central.",
      }, { status: 400 });
    }

    const token = Deno.env.get(TOKEN_ENV[branch]);
    if (!token) {
      return withCors({
        ok: false,
        branch,
        error: `No hay token configurado (${TOKEN_ENV[branch]}).`,
      }, { status: 500 });
    }

    let fini: number | null = null;
    let ffin: number | null = null;

    if (date) {
      ({ fini, ffin } = parseDateToEpochRange(date));
    } else if (finiParam || ffinParam) {
      if (!finiParam || !ffinParam) {
        return withCors({
          ok: false,
          branch,
          error: "Debes proporcionar ambos parámetros fini y ffin.",
        }, { status: 400 });
      }
      fini = Math.trunc(Number(finiParam));
      ffin = Math.trunc(Number(ffinParam));
      if (!Number.isFinite(fini) || !Number.isFinite(ffin) || fini <= 0 || ffin <= 0) {
        return withCors({
          ok: false,
          branch,
          error: "fini/ffin deben ser enteros válidos en segundos.",
        }, { status: 400 });
      }
    } else {
      const now = tzDate(new Date(), PANAMA_TZ);
      const y = now.getFullYear();
      const m = pad(now.getMonth() + 1);
      const d = pad(now.getDate());
      ({ fini, ffin } = parseDateToEpochRange(`${y}-${m}-${d}`));
    }

    if (fini > ffin) {
      return withCors({
        ok: false,
        branch,
        fini,
        ffin,
        error: "fini no puede ser mayor que ffin.",
      }, { status: 400 });
    }

    if (fini == null || ffin == null) {
      return withCors({
        ok: false,
        branch,
        error: "Rango inválido: faltan fini/ffin.",
      }, { status: 400 });
    }

    fini = Math.trunc(fini);
    ffin = Math.trunc(ffin);

    const invuUrl = buildInvuUrl(fini, ffin);
    let response: Response;
    try {
      response = await fetchWithRetry(invuUrl, token, DEFAULT_TIMEOUT);
    } catch (err) {
      return withCors({
        ok: false,
        branch,
        fini,
        ffin,
        error: "INVU fetch failed",
        detail: err instanceof Error ? err.message : String(err),
      }, { status: 504 });
    }

    const rawText = await response.text().catch(() => "");
    if (response.status === 404) {
      let detail: unknown = rawText;
      try {
        detail = JSON.parse(rawText);
      } catch {
        // ignore
      }
      return withCors({
        ok: false,
        branch,
        fini,
        ffin,
        status: 404,
        error: "INVU fetch failed",
        detail,
      }, { status: 404 });
    }

    if (!response.ok) {
      return withCors({
        ok: false,
        branch,
        fini,
        ffin,
        status: response.status,
        error: "INVU fetch failed",
        detail: rawText.slice(0, 300),
      }, { status: response.status || 502 });
    }

    let parsed: unknown = rawText;
    try {
      parsed = rawText ? JSON.parse(rawText) : [];
    } catch {
      return withCors({
        ok: false,
        branch,
        fini,
        ffin,
        status: 502,
        error: "INVU devolvió una respuesta no JSON.",
        detail: rawText.slice(0, 300),
      }, { status: 502 });
    }

    const data = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>)?.data)
        ? (parsed as Record<string, unknown>).data
        : [];

    return withCors({
      ok: true,
      branch,
      fini: Math.trunc(fini),
      ffin: Math.trunc(ffin),
      count: Array.isArray(data) ? data.length : 0,
      data,
    }, { status: 200 });
  } catch (err) {
    return withCors({
      ok: false,
      error: "Unexpected error",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
};

Deno.serve({ onRequest: handler, verify: false });

export default handler;
