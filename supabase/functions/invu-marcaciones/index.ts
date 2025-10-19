const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function ok(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}), ...cors },
  });
}
function err(status: number, body: unknown) { return ok(body, { status }); }

const BRANCH_ENV: Record<string,string> = {
  sf:        "SF_TOKEN",
  museo:     "MUSEO_TOKEN",
  cangrejo:  "CANGREJO_TOKEN",
  costa:     "COSTA_TOKEN",
  central:   "CENTRAL_TOKEN",
};

function toEpochsFromDatePanama(isoDate: string) {
  // Panamá UTC-5 (sin DST)
  const start = new Date(`${isoDate}T00:00:00-05:00`);
  const end   = new Date(`${isoDate}T23:59:59-05:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date");
  }
  return {
    fini: Math.floor(start.getTime()/1000),
    ffin: Math.floor(end.getTime()/1000),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const branch = (url.searchParams.get("branch") || "").toLowerCase();
    const date = url.searchParams.get("date");
    const finiQ = url.searchParams.get("fini");
    const ffinQ = url.searchParams.get("ffin");

    if (!branch || !["sf","museo","cangrejo","costa","central"].includes(branch)) {
      return err(400, { ok:false, error:"Missing/invalid branch" });
    }
    const envByBranch: Record<string,string> = {
      sf: "SF_TOKEN", museo: "MUSEO_TOKEN", cangrejo: "CANGREJO_TOKEN",
      costa: "COSTA_TOKEN", central: "CENTRAL_TOKEN",
    };
    const tokenEnv = envByBranch[branch];
    const TOKEN = Deno.env.get(tokenEnv);
    if (!TOKEN) return err(500, { ok:false, error:`Missing secret ${tokenEnv}` });

    let fini: number, ffin: number;
    if (date) {
      ({ fini, ffin } = toEpochsFromDatePanama(date));
    } else if (finiQ && ffinQ) {
      fini = Number(finiQ); ffin = Number(ffinQ);
      if (!Number.isFinite(fini) || !Number.isFinite(ffin)) {
        return err(400, { ok:false, error:"fini/ffin must be numbers" });
      }
    } else {
      return err(400, { ok:false, error:"Provide ?date=YYYY-MM-DD or ?fini=...&ffin=..." });
    }

    const invuUrl = `https://api6.invupos.com/invuApiPos/index.php?r=empleados/movimientos/fini/${fini}/ffin/${ffin}`;
    const r = await fetch(invuUrl, {
      method: "GET",
      headers: { "AUTHORIZATION": TOKEN, "accept": "application/json" },
    });

    const text = await r.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!r.ok) {
      return err(r.status, { ok:false, error:"INVU fetch failed", status:r.status, detail:data });
    }

    const payload = Array.isArray(data) ? data : (data?.data ?? data);
    return ok({ ok:true, branch, fini, ffin, count: Array.isArray(payload) ? payload.length : undefined, data: payload });
  } catch (e) {
    return err(500, { ok:false, error: e?.message ?? "unknown" });
  }
});
