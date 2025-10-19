// supabase/functions/invu-attendance/index.ts
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
const DEFAULT_TIMEOUT = Number(
  Deno.env.get("INVU_ATTENDANCE_TIMEOUT_MS")
    ?? Deno.env.get("INVU_MARCACIONES_TIMEOUT_MS")
    ?? "15000",
);
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
  const base = (
    Deno.env.get("INVU_ATTENDANCE_BASE_URL")
      ?? Deno.env.get("INVU_MARCACIONES_BASE_URL")
      ?? "https://api6.invupos.com/invuApiPos"
  ).replace(/\/+$/, "");
  const template = (
    Deno.env.get("INVU_ATTENDANCE_PATH")
      ?? "index.php?r=empleados/movimientos/fini/{F_INI}/ffin/{F_FIN}"
  )
    .replace("{F_INI}", String(fini))
    .replace("{F_FIN}", String(ffin));
  return `${base}/${template.replace(/^\/+/, "")}`;
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

const toSample = (source: unknown): string | null => {
  if (source == null) return null;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) return null;
    return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
  }
  try {
    const json = JSON.stringify(source);
    if (!json) return null;
    return json.length > 200 ? `${json.slice(0, 200)}…` : json;
  } catch {
    return String(source).slice(0, 200);
  }
};

const respondError = (
  status: number,
  message: string,
  {
    branch,
    fini,
    ffin,
    invuUrl,
    sampleSource,
  }: {
    branch?: string | null;
    fini?: number | null;
    ffin?: number | null;
    invuUrl?: string | null;
    sampleSource?: unknown;
  } = {},
) => {
  const sample = toSample(sampleSource);
  return withCors({
    ok: false,
    status,
    error: message,
    branch: branch ?? null,
    fini: fini ?? null,
    ffin: ffin ?? null,
    inv_url: invuUrl ?? null,
    sample: sample ?? null,
  }, { status });
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
      return respondError(400, "Parámetro branch inválido. Usa sf|museo|cangrejo|costa|central.", {
        branch: branchParam || null,
      });
    }

    const token = Deno.env.get(TOKEN_ENV[branch]);
    if (!token) {
      return respondError(500, `No hay token configurado (${TOKEN_ENV[branch]}).`, {
        branch,
      });
    }

    let fini: number | null = null;
    let ffin: number | null = null;

    if (date) {
      ({ fini, ffin } = parseDateToEpochRange(date));
    } else if (finiParam || ffinParam) {
      if (!finiParam || !ffinParam) {
        return respondError(400, "Debes proporcionar ambos parámetros fini y ffin.", {
          branch,
        });
      }
      fini = Math.trunc(Number(finiParam));
      ffin = Math.trunc(Number(ffinParam));
      if (!Number.isFinite(fini) || !Number.isFinite(ffin) || fini <= 0 || ffin <= 0) {
        return respondError(400, "fini/ffin deben ser enteros válidos en segundos.", {
          branch,
          fini,
          ffin,
        });
      }
    } else {
      const now = tzDate(new Date(), PANAMA_TZ);
      const y = now.getFullYear();
      const m = pad(now.getMonth() + 1);
      const d = pad(now.getDate());
      ({ fini, ffin } = parseDateToEpochRange(`${y}-${m}-${d}`));
    }

    if (fini > ffin) {
      return respondError(400, "fini no puede ser mayor que ffin.", {
        branch,
        fini,
        ffin,
      });
    }

    if (fini == null || ffin == null) {
      return respondError(400, "Rango inválido: faltan fini/ffin.", {
        branch,
        fini,
        ffin,
      });
    }

    fini = Math.trunc(fini);
    ffin = Math.trunc(ffin);

    const invuUrl = buildInvuUrl(fini, ffin);
    let response: Response;
    try {
      response = await fetchWithRetry(invuUrl, token, DEFAULT_TIMEOUT);
    } catch (err) {
      return respondError(504, "INVU fetch failed (timeout/error).", {
        branch,
        fini,
        ffin,
        invuUrl,
        sampleSource: err instanceof Error ? err.message : err,
      });
    }

    const rawText = await response.text().catch(() => "");
    if (response.status === 404) {
      let detail: unknown = rawText;
      try {
        detail = JSON.parse(rawText);
      } catch {
        // ignore
      }
      return respondError(404, "INVU fetch failed (404).", {
        branch,
        fini,
        ffin,
        invuUrl,
        sampleSource: detail,
      });
    }

    if (!response.ok) {
      return respondError(response.status || 502, "INVU fetch failed.", {
        branch,
        fini,
        ffin,
        invuUrl,
        sampleSource: rawText || response.statusText,
      });
    }

    let parsed: unknown = rawText;
    try {
      parsed = rawText ? JSON.parse(rawText) : [];
    } catch {
      return respondError(502, "INVU devolvió una respuesta no JSON.", {
        branch,
        fini,
        ffin,
        invuUrl,
        sampleSource: rawText,
      });
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
      inv_url: invuUrl,
      count: Array.isArray(data) ? data.length : 0,
      data,
    }, { status: 200 });
  } catch (err) {
    return respondError(500, "Unexpected error en invu-attendance.", {
      sampleSource: err instanceof Error ? err.message : String(err),
    });
  }
};

Deno.serve({ onRequest: handler, verify: false });

export default handler;
