// supabase/functions/invu-marcaciones/index.ts
// RAW (default): empleados con movimientos
// FLAT (?flat=1): lista plana de movimientos
// ?branch=sf&date=YYYY-MM-DD  o  ?branch=sf&fini=epoch&ffin=epoch

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

function withCors(handler: (req: Request) => Promise<Response> | Response) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const res = await handler(req);
    const h = new Headers(res.headers);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => h.set(k, v));
    return new Response(res.body, { status: res.status, headers: h });
  };
}

const BASE_URL = "https://api6.invupos.com/invuApiPos/index.php";

type Branch = "sf" | "museo" | "cangrejo" | "costa" | "central";
type TokenRec = { token: string; expires_utc?: string };
type TokenMap = Record<string, TokenRec>;

function normBranch(b: string | null): Branch {
  const v = (b ?? "").toLowerCase().trim();
  if (["sf", "museo", "cangrejo", "costa", "central"].includes(v)) return v as Branch;
  throw new Error("Missing or invalid branch");
}

function loadTokens(): TokenMap {
  const raw = Deno.env.get("INVU_TOKENS_JSON") ?? "{}";
  try { return JSON.parse(raw); }
  catch (e) { throw new Error(`INVU_TOKENS_JSON inválido: ${e}`); }
}

function tokenFor(branch: Branch): string | null {
  return loadTokens()[branch]?.token ?? null;
}

function parseRange(q: URLSearchParams) {
  const date = q.get("date");
  if (date) {
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

async function hitInvu(url: string, token: string) {
  const resp = await fetch(url, {
    headers: { authorization: token, accept: "application/json" },
  });
  const ctype = resp.headers.get("content-type") ?? "";
  const body = ctype.includes("application/json")
    ? await resp.json().catch(() => ({}))
    : await resp.text().catch(() => "");
  return { resp, body };
}

function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function flattenMovements(rawEmployees: any[], branch: Branch) {
  const out: any[] = [];
  for (const emp of rawEmployees) {
    const movs = Array.isArray(emp?.movimientos) ? emp.movimientos : [];
    for (const m of movs) {
      out.push({
        empleado_id: emp?.id ?? m?.empleado_id ?? null,
        sucursal_id: m?.sucursal_id ?? null,
        centro: m?.centro ?? branch,
        code: m?.code ?? "attendance",
        qty: m?.qty ?? 1,
        monto: m?.monto ?? m?.total ?? 0,
        fecha: m?.fecha ?? null,
        _raw_empleado: emp,
        _raw_mov: m,
      });
    }
  }
  return out;
}

Deno.serve(
  withCors(async (req) => {
    const started = Date.now();
    try {
      const url = new URL(req.url);
      const q = url.searchParams;

      const branch = normBranch(q.get("branch"));
      const { fini, ffin } = parseRange(q);
      const flat = q.get("flat") === "1" || q.get("flat") === "true";

      const token = tokenFor(branch);
      if (!token) return json(401, { ok: false, error: "Missing token", branch });

      const invuUrl = `${BASE_URL}?r=empleados/movimientos/fini/${fini}/ffin/${ffin}`;
      const { resp, body } = await hitInvu(invuUrl, token);
      const elapsedMs = Date.now() - started;

      const status = resp.status || 502;
      const wrap = typeof body === "string" ? {} : (body as any);

      // Normaliza: {data:[...]}, {employees:[...]}, array plano
      const raw = Array.isArray(wrap?.data)
        ? wrap.data
        : Array.isArray(wrap?.employees)
        ? wrap.employees
        : Array.isArray(body)
        ? (body as any)
        : [];

      const invError = (wrap as any)?.error === true || (status >= 400 && status < 600);
      if (invError) {
        return json(status, {
          ok: false, status, error: "INVU fetch failed",
          branch, fini, ffin, invuUrl, elapsedMs, detail: body,
        });
      }

      const data = flat ? flattenMovements(raw, branch) : raw;

      return json(200, {
        ok: true,
        branch,
        fini,
        ffin,
        mode: flat ? "flat" : "raw",
        count: Array.isArray(data) ? data.length : 0,
        data,
        elapsedMs,
      });
    } catch (e: any) {
      const elapsedMs = Date.now() - started;
      return json(504, { ok: false, status: 504, error: String(e?.message || e), elapsedMs });
    }
  })
);
