/* ──────────────────────────────────────────────────────────────
   sync-ventas-v8.4
   Pull + ingest de ventas y totales INVU (7 Granos)
   Compatible con INVU API v1.0 (AUTHORIZATION header, querystring)
   Última revisión: 2025-11-01
──────────────────────────────────────────────────────────────── */ import { createClient } from 
"https://esm.sh/@supabase/supabase-js@2";
/* ──────────────────────────────────────────────────────────────
   CONFIG
──────────────────────────────────────────────────────────────── */ function getTokenPorSucursal(s) {
  switch(s.toLowerCase()){
    case "cangrejo":
      return Deno.env.get("CANGREJO_TOKEN");
    case "costa":
      return Deno.env.get("COSTA_TOKEN");
    case "central":
      return Deno.env.get("CENTRAL_TOKEN");
    case "sf":
      return Deno.env.get("SF_TOKEN");
    case "museo":
      return Deno.env.get("MUSEO_TOKEN");
    default:
      return undefined;
  }
}
/* ──────────────────────────────────────────────────────────────
   URL Builders (querystring + tipo=1=Cerrada)
──────────────────────────────────────────────────────────────── */ function invuUrlTotales(start, end) {
  const u = new URL("https://api6.invupos.com/invuApiPos/index.php");
  u.searchParams.set("r", "citas/OrdenesAllTotales");
  u.searchParams.set("fini", String(start));
  u.searchParams.set("ffin", String(end));
  u.searchParams.set("tipo", "1");
  return u.toString();
}
function invuUrlDetalle(start, end) {
  const u = new URL("https://api6.invupos.com/invuApiPos/index.php");
  u.searchParams.set("r", "citas/ordenesAllAd");
  u.searchParams.set("fini", String(start));
  u.searchParams.set("ffin", String(end));
  u.searchParams.set("tipo", "1");
  return u.toString();
}
/* ──────────────────────────────────────────────────────────────
   Fetch genérico INVU (AUTHORIZATION header en mayúsculas)
──────────────────────────────────────────────────────────────── */ async function invuFetch(url, token) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      AUTHORIZATION: token
    }
  });
  const text = await res.text();
  console.log(`[INVU] ${url} → status=${res.status} bodyHead=${text.slice(0, 180)}`);
  if (!res.ok) throw new Error(`INVU ${res.status}: ${text}`);
  return JSON.parse(text);
}
/* ──────────────────────────────────────────────────────────────
   Helper: respuesta JSON
──────────────────────────────────────────────────────────────── */ function jsonResponse(status, body) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
/* ──────────────────────────────────────────────────────────────
   MAIN HANDLER
──────────────────────────────────────────────────────────────── */ Deno.serve(async (req)=>{
  try {
    const body = await req.json();
    const { sucursal, start_ts, end_ts, mode = "pull_detalle" } = body;
    const token = getTokenPorSucursal(sucursal || "");
    if (!token) return jsonResponse(400, {
      ok: false,
      error: "Sucursal o token inválido"
    });
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    /* ─────────────────────────────── pull_totales ────────────── */ if (mode === "pull_totales") {
      const url = invuUrlTotales(start_ts, end_ts);
      const data = await invuFetch(url, token);
      return jsonResponse(200, {
        ok: true,
        kind: "totales",
        count: Array.isArray(data?.data) ? data.data.length : 0,
        data
      });
    }
    /* ─────────────────────────────── pull_detalle ────────────── */ if (mode === "pull_detalle") {
      const url = invuUrlDetalle(start_ts, end_ts);
      const data = await invuFetch(url, token);
      return jsonResponse(200, {
        ok: true,
        kind: "detalle",
        count: Array.isArray(data?.data) ? data.data.length : 0,
        data
      });
    }
    /* ─────────────────────────────── ingest_totales ───────────── */ if (mode === "ingest_totales") {
      const rows = body.data?.data ?? [];
      const upserts = rows.map((r)=>({
          sucursal,
          dia: r.fecha ?? r.dia ?? null,
          total_cerradas: Number(r.total ?? r.monto ?? 0)
        }));
      const { error } = await supabase.from("invu_totales_dia").upsert(upserts, {
        onConflict: "sucursal,dia"
      });
      if (error) throw error;
      return jsonResponse(200, {
        ok: true,
        inserted: upserts.length
      });
    }
    /* ─────────────────────────────── ingest_detalle ───────────── */ if (mode === "ingest_detalle") {
      const rows = body.data?.data ?? [];
      const mapped = rows.map((r)=>({
          sucursal,
          id_orden: String(r.id ?? r.num_orden ?? r.numero_factura ?? crypto.randomUUID()),
          fecha_creacion: r.fecha_creacion ?? r.fecha_creacion_date ?? null,
          fecha_cierre: r.fecha_cierre ?? r.fecha_cierre_date ?? null,
          estado: r.pagada ?? r.status ?? null,
          total: Number(r.total ?? r.total_pagar ?? 0),
          subtotal: Number(r.subtotal ?? 0),
          tax: Number(r.tax ?? r.impuesto ?? 0),
          propina: Number(r.propina ?? 0),
          moneda: r?.moneda?.simbolo ?? r?.moneda ?? "$",
          raw: r
        }));
      const { error } = await supabase.from("invu_ventas").upsert(mapped, {
        onConflict: "sucursal,id_orden"
      });
      if (error) throw error;
      return jsonResponse(200, {
        ok: true,
        upserted: mapped.length
      });
    }
    /* ─────────────────────────────── invalid mode ─────────────── */ return jsonResponse(400, {
      ok: false,
      error: "Modo inválido"
    });
  } catch (err) {
    console.error("❌ sync-ventas-v8.4 error:", err);
    return jsonResponse(500, {
      ok: false,
      error: String(err)
    });
  }
});


