import { withCors } from "../_shared/cors.ts";

type Branch = "sf" | "museo" | "cangrejo" | "costa" | "central";

const MOVS_URL = "https://api6.invupos.com/invuApiPos/index.php";

function normBranch(b: string | null): Branch {
  const v = (b ?? "").toLowerCase().trim();
  if (["sf","museo","cangrejo","costa","central"].includes(v)) return v as Branch;
  throw new Error("Missing or invalid branch");
}

function mapToken(branch: Branch): string | null {
  const m: Record<Branch, string | undefined> = {
    sf: Deno.env.get("SF_TOKEN"),
    museo: Deno.env.get("MUSEO_TOKEN"),
    cangrejo: Deno.env.get("CANGREJO_TOKEN"),
    costa: Deno.env.get("COSTA_TOKEN"),
    central: Deno.env.get("CENTRAL_TOKEN"),
  };
  return m[branch] ?? null;
}

function parseRange(q: URLSearchParams) {
  const date = q.get("date");
  if (date) {
    // Panamá UTC-5
    const fini = Math.floor(new Date(`${date}T00:00:00-05:00`).getTime() / 1000);
    const ffin = Math.floor(new Date(`${date}T23:59:59-05:00`).getTime() / 1000);
    return { fini, ffin };
  }
  const fini = Number(q.get("fini") ?? 0);
  const ffin = Number(q.get("ffin") ?? 0);
  if (!Number.isFinite(fini) || !Number.isFinite(ffin) || fini <= 0 || ffin <= 0) {
    throw new Error("Missing or invalid date");
  }
  return { fini, ffin };
}

async function fetchWithTimeout(url: string, opts: RequestInit, ms = 10000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function hitInvu(inv_url: string, token: string, retries = 1): Promise<{resp: Response; body: any}> {
  let lastErr: any = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetchWithTimeout(inv_url, { headers: { Authorization: token } }, 10000);
      const body = await resp.json().catch(() => ({}));
      return { resp, body };
    } catch (e) {
      lastErr = e;
      if (i < retries) continue;
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(withCors(async (req) => {
  const started = Date.now();
  try {
    const url = new URL(req.url);
    const q = url.searchParams;
    const branch = normBranch(q.get("branch"));
    const { fini, ffin } = parseRange(q);

    const token = mapToken(branch);
    if (!token) return json(401, { ok:false, error:"Missing token", branch });

    const inv_url = `${MOVS_URL}?r=empleados/movimientos/fini/${fini}/ffin/${ffin}`;

    const { resp, body } = await hitInvu(inv_url, token, 1);
    const elapsedMs = Date.now() - started;

    // INVU a veces responde 200 con {error:true,...}
    const invError = body?.error === true || (resp.status >= 400 && resp.status < 600);
    if (invError) {
      return json(resp.status || 502, {
        ok: false,
        status: resp.status || 502,
        error: "INVU fetch failed",
        branch, fini, ffin, inv_url,
        elapsedMs,
        detail: body,
      });
    }

    const data = Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : []);
    return json(200, { ok: true, branch, fini, ffin, count: data.length, data, elapsedMs });

  } catch (e: any) {
    const elapsedMs = Date.now() - started;
    const msg = String(e?.name || "").includes("AbortError")
      ? "upstream timeout"
      : (e?.message ?? "unknown");
    return json(504, { ok:false, status:504, error: msg, elapsedMs });
  }
}));
