// 7 Granos — INVU Sync (detalle) — v12
// Modos:
//  - pull_detalle: GET citas/ordenesAllAdv/fini/{start}/ffin/{end}/tipo/1 (por sucursal)
//  - ingest_detalle: upsert a invu_ventas (solo columnas existentes)
//  - pull_ingest_range_all: ejecuta pull→ingest para TODAS las sucursales (batch para CRON)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const N = (x, def = 0)=>{
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
};
const parseFecha = (v)=>{
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    try {
      const num = Number(s);
      const ms = s.length > 10 ? num : num * 1000;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    } catch  {
      return null;
    }
  }
  return s.slice(0, 10);
};
function getTokenPorSucursal(branch) {
  switch((branch || "").toLowerCase()){
    case "cangrejo":
      return Deno.env.get("CANGREJO_TOKEN") || undefined;
    case "costa":
      return Deno.env.get("COSTA_TOKEN") || undefined;
    case "central":
      return Deno.env.get("CENTRAL_TOKEN") || undefined;
    case "sf":
      return Deno.env.get("SF_TOKEN") || undefined;
    case "museo":
      return Deno.env.get("MUSEO_TOKEN") || undefined;
    default:
      return undefined;
  }
}
function invuUrlDetalle(start, end) {
  const u = new URL("https://api6.invupos.com/invuApiPos/index.php");
  u.searchParams.set("r", `citas/ordenesAllAdv/fini/${start}/ffin/${end}/tipo/1`);
  return u.toString();
}
async function invuFetch(url, token) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      AUTHORIZATION: token
    }
  });
  const text = await res.text();
  console.log(`[INVU] ${res.status} ${url} :: ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`INVU ${res.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch  {
    return {
      data: []
    };
  }
}
function j(status, body) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
// Normaliza alias de sucursal a etiqueta humana (para buscar en tabla `sucursales`)
function canonicalNameFromBranch(branch) {
  const b = branch.toLowerCase();
  if (b === "sf" || b.includes("fran")) return "San Francisco";
  if (b === "central" || b.includes("matriz")) return "7 Granos - Matriz";
  if (b.includes("cangrejo")) return "El Cangrejo";
  if (b.includes("costa")) return "Costa del Este";
  if (b.includes("museo")) return "Museo";
  return branch;
}
async function getSucursalIdByBranch(supabase, branch) {
  const wanted = canonicalNameFromBranch(branch);
  // 1) Intento por igualdad exacta
  {
    const { data, error } = await supabase.from("sucursales").select("id,nombre").eq("nombre", wanted).limit(1);
    if (!error && data && data.length) return data[0].id;
  }
  // 2) Intento por ILIKE contiene
  {
    const { data, error } = await supabase.from("sucursales").select("id,nombre").ilike("nombre", `%${wanted}%`).limit(1);
    if (!error && data && data.length) return data[0].id;
  }
  // 3) Intento por alias mínimos
  const hints = {
    cangrejo: "Cangrejo",
    costa: "Costa",
    sf: "Francisco",
    museo: "Museo",
    central: "Matriz"
  };
  for (const key of Object.keys(hints)){
    if (branch.toLowerCase().includes(key)) {
      const { data, error } = await supabase.from("sucursales").select("id,nombre").ilike("nombre", `%${hints[key]}%`).limit(1);
      if (!error && data && data.length) return data[0].id;
    }
  }
  return null;
}
// Reutiliza la propia función (self-invoke) para batch
async function selfInvoke(req, payload) {
  const u = new URL(req.url);
  u.pathname = "/sync-ventas-v12";
  return await fetch(u.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": req.headers.get("Authorization") ?? "",
      "apikey": req.headers.get("apikey") ?? ""
    },
    body: JSON.stringify(payload)
  });
}
async function runPullIngestForBranch(req, supabase, sucursal, start_ts, end_ts) {
  // 1) Pull
  const pullResp = await selfInvoke(req, {
    mode: "pull_detalle",
    sucursal,
    start_ts,
    end_ts
  });
  if (!pullResp.ok) {
    const txt = await pullResp.text();
    return {
      sucursal,
      ok: false,
      step: "pull",
      error: `HTTP ${pullResp.status} · ${txt.slice(0, 180)}`
    };
  }
  const pullJson = await pullResp.json();
  const rows = Array.isArray(pullJson?.data?.data) ? pullJson.data.data : Array.isArray(pullJson?.data) ? pullJson.data : Array.isArray(pullJson) ? pullJson : [];
  // 2) Ingest (pasamos directamente el array para evitar payloads anidados gigantes)
  const ingestResp = await selfInvoke(req, {
    mode: "ingest_detalle",
    sucursal,
    start_ts,
    end_ts,
    data: rows
  });
  if (!ingestResp.ok) {
    const txt = await ingestResp.text();
    return {
      sucursal,
      ok: false,
      step: "ingest",
      pulled: rows.length,
      error: `HTTP ${ingestResp.status} · ${txt.slice(0, 180)}`
    };
  }
  const ingestJson = await ingestResp.json().catch(()=>({}));
  return {
    sucursal,
    ok: true,
    pulled: rows.length,
    upserted: ingestJson?.upserted ?? null
  };
}
Deno.serve(async (req)=>{
  try {
    const body = await req.json().catch(()=>({}));
    const { mode = "pull_detalle", sucursal, start_ts, end_ts } = body;
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    // -------- pull_detalle --------
    if (mode === "pull_detalle") {
      if (!sucursal || !start_ts || !end_ts) {
        return j(400, {
          ok: false,
          error: "Faltan parámetros: sucursal, start_ts, end_ts"
        });
      }
      const token = body.token || getTokenPorSucursal(sucursal);
      if (!token) return j(400, {
        ok: false,
        error: "Token no encontrado para la sucursal"
      });
      const url = invuUrlDetalle(Number(start_ts), Number(end_ts));
      const data = await invuFetch(url, token);
      const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      return j(200, {
        ok: true,
        kind: "detalle",
        count: rows.length,
        data
      });
    }
    // -------- ingest_detalle --------
    if (mode === "ingest_detalle") {
      // Soporta: root = array plano | {data:[...]} | {data:{data:[...]}}
      const root = body?.data ?? {};
      const rows = Array.isArray(root?.data?.data) ? root.data.data : Array.isArray(root?.data) ? root.data : Array.isArray(root) ? root : [];
      if (!Array.isArray(rows) || rows.length === 0) {
        return j(200, {
          ok: true,
          upserted: 0,
          reason: "payload vacío"
        });
      }
      const branch = String(body?.sucursal ?? "").toLowerCase();
      const sucursal_id = await getSucursalIdByBranch(supabase, branch).catch(()=>null);
      const mapped = rows.map((r)=>({
          // Columnas REALES de invu_ventas:
          fecha: parseFecha(r.fecha_cierre_date ?? r.fecha_creacion ?? r.fecha_apertura_date),
          subtotal: N(r.subtotal ?? r.totales?.subtotal),
          itbms: N(r.tax ?? r.totales?.tax ?? r.impuesto),
          total: N(r.total ?? r.totales?.total ?? r.total_pagar),
          propina: N(r.propina ?? r.totales?.propina),
          num_items: Array.isArray(r.items) ? r.items.length : Array.isArray(r.detalle) ? r.detalle.length : null,
          sucursal_id,
          branch,
          invu_id: String(r.num_orden ?? r.numero_factura ?? r.id_ord ?? r.id ?? crypto.randomUUID()),
          raw: r,
          num_transacciones: 1,
          estado: r.pagada ?? r.status ?? null
        }));
      const { error } = await supabase.from("invu_ventas").upsert(mapped, {
        onConflict: "branch,invu_id"
      });
      if (error) return j(500, {
        ok: false,
        error: error.message || String(error)
      });
      return j(200, {
        ok: true,
        upserted: mapped.length
      });
    }
    // -------- pull_ingest_range_all (batch para CRON) --------
    if (mode === "pull_ingest_range_all") {
      const s = Number(start_ts ?? 0);
      const e = Number(end_ts ?? 0);
      if (!s || !e) return j(400, {
        ok: false,
        error: "Faltan start_ts/end_ts"
      });
      const branches = [
        "cangrejo",
        "costa",
        "sf",
        "museo",
        "central"
      ];
      const results = [];
      for (const b of branches){
        const r = await runPullIngestForBranch(req, supabase, b, s, e);
        results.push(r);
      }
      return j(200, {
        ok: results.every((r)=>r.ok),
        start_ts: s,
        end_ts: e,
        results
      });
    }
    return j(400, {
      ok: false,
      error: "Modo inválido. Usa: pull_detalle | ingest_detalle | pull_ingest_range_all"
    });
  } catch (e) {
    console.error("sync-ventas-v12 error:", e);
    return j(500, {
      ok: false,
      error: String(e)
    });
  }
});
