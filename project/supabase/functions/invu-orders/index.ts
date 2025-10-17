// supabase/functions/invu-orders/index.ts
// Deno (Edge Functions). Proxy seguro para INVU por sucursal.
// Uso: GET /invu-orders?branch=sf&from=2025-10-08&to=2025-10-08

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type BranchKey = "sf" | "museo" | "cangrejo" | "costa" | "central";

const BRANCH_ENV: Record<BranchKey, string> = {
  sf: "SF_TOKEN",
  museo: "MUSEO_TOKEN",
  cangrejo: "CANGREJO_TOKEN",
  costa: "COSTA_TOKEN",
  central: "CENTRAL_TOKEN",
};

function ymdToEpoch(ymd: string, endOfDay = false) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d, 0, 0, 0);
  return Math.floor(dt.getTime() / 1000);
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const branch = (url.searchParams.get("branch") || "").toLowerCase() as BranchKey;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!branch || !(branch in BRANCH_ENV)) {
      return new Response(JSON.stringify({ error: "branch inválido. Usa: sf | museo | cangrejo | costa | central" }), { status: 400 });
    }
    if (!from || !to) {
      return new Response(JSON.stringify({ error: "falta from/to (YYYY-MM-DD)" }), { status: 400 });
    }

    const token = Deno.env.get(BRANCH_ENV[branch]);
    if (!token) {
      return new Response(JSON.stringify({ error: `No hay token en secret ${BRANCH_ENV[branch]}` }), { status: 500 });
    }

    const fini = ymdToEpoch(from, false);
    const ffin = ymdToEpoch(to, true);
    const invuUrl = `https://api6.invupos.com/invuApiPos/index.php?r=citas/ordenesAllAdv/fini/${fini}/ffin/${ffin}/tipo/all`;

    const res = await fetch(invuUrl, {
      method: "GET",
      headers: {
        "AUTHORIZATION": token, // sin "Bearer"
        "accept": "application/json",
      },
    });

    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
