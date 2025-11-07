// supabase/functions/sync-ventas-v12/index.ts
// 7 Granos — INVU Sync (detalle)
// - mode: "pull_detalle"   => descarga de INVU (rango día a día, fin-exclusivo, tz Panamá)
// - mode: "ingest_detalle" => upsert en invu_ventas

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ────────────────────────────────────────────────────────────
// Helpers básicos
// ────────────────────────────────────────────────────────────
const N = (x: any, def = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
};

const toPanamaYMD = (v: any): string | null => {
  // Acepta epoch (s/ ms) o string fecha(ISO / 'YYYY-MM-DD HH:MM:SS')
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;

  let d: Date | null = null;

  // epoch?
  if (/^\d+$/.test(s)) {
    const num = Number(s);
    const ms = s.length > 10 ? num : num * 1000;
    d = new Date(ms);
  } else {
    // string fecha
    const tryDate = new Date(s);
    d = isNaN(tryDate.getTime()) ? null : tryDate;
  }
  if (!d || isNaN(d.getTime())) return null;

  // Formatear en zona Panamá
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Panama",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
};

const parseFecha = (v: any): string | null => {
  // Para compatibilidad con lo que ya tenías
  return toPanamaYMD(v);
};

const panamaEpoch00 = (ymd: string): number => {
  // epoch (segundos) para 00:00:00 del día en Panamá
  // Usamos truco: construir la fecha local mediante componentes
  const [y, m, d] = ymd.split("-").map(Number);
  // Crear fecha "aparente" en Panamá: usamos toLocaleString para corregir zona
  const js = new Date(
    new Date(
      `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(
        d
      ).padStart(2, "0")}T00:00:00`
    ).toLocaleString("en-US", { timeZone: "America/Panama" })
  );
  return Math.floor(js.getTime() / 1000);
};

const addDaysYMD = (ymd: string, days: number): string => {
  const [y, m, d] = ymd.split("-").map(Number);
  const tmp = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  tmp.setUTCDate(tmp.getUTCDate() + days);
  const yy = tmp.getUTCFullYear();
  const mm = String(tmp.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tmp.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

// ────────────────────────────────────────────────────────────
// Config INVU
// ────────────────────────────────────────────────────────────
function getTokenPorSucursal(branch?: string) {
  switch ((branch || "").toLowerCase()) {
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

// DOC INVU: /citas/ordenesAllAddv/fini/{epoch}/ffin/{epoch}/tipo/{all|1|2|4}
// Usamos tipo=all para incluir abiertas(1), cerradas(2) y crédito parcial(4).
function invuUrlDetalle(startEpoch: number, endEpoch: number) {
  const u = new URL("https://api6.invupos.com/invuApiPos/index.php");
  // Nota: en la doc es "ordenesAllAddv" (con 'Addv')
  u.searchParams.set("r", `citas/ordenesAllAddv/fini/${startEpoch}/ffin/${endEpoch}/tipo/all`);
  return u.toString();
}

async function invuFetch(url: string, token: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", AUTHORIZATION: token },
  });
  const text = await res.text();
  console.log(`[INVU] ${res.status} ${url} :: ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`INVU ${res.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return { data: [] };
  }
}

// ────────────────────────────────────────────────────────────
// Respuesta JSON
// ────────────────────────────────────────────────────────────
function j(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    let { mode = "pull_detalle", sucursal, start_ts, end_ts, desde, hasta } =
      body || {};

    // Credenciales Supabase (sin SUPABASE_ prefijo por restricciones del CLI)
    const supaUrl = Deno.env.get("SERVICE_URL") || Deno.env.get("SUPABASE_URL");
    const serviceKey =
      Deno.env.get("SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !serviceKey) {
      return j(500, { ok: false, error: "Faltan SERVICE_URL / SERVICE_ROLE_KEY" });
    }
    const supabase = createClient(supaUrl, serviceKey);

    // Permitir también YYYY-MM-DD (desde/hasta) además de epoch (start_ts/end_ts)
    // Regla: ventana fin-exclusivo; si viene hasta YYYY-MM-DD incluimos ese día → end = hasta + 1
    if (!start_ts || !end_ts) {
      if (desde && hasta) {
        const desdeY = String(desde);
        const hastaY = String(hasta);
        const endIncY = addDaysYMD(hastaY, 1); // fin-exclusivo
        start_ts = panamaEpoch00(desdeY);
        end_ts = panamaEpoch00(endIncY);
      }
    }

    if (mode === "pull_detalle") {
      if (!sucursal || !start_ts || !end_ts) {
        return j(400, {
          ok: false,
          error:
            "Faltan parámetros: sucursal, start_ts, end_ts (o usa desde/hasta YYYY-MM-DD)",
        });
      }
      const token = body.token || getTokenPorSucursal(sucursal);
      if (!token)
        return j(400, {
          ok: false,
          error: "Token no encontrado para la sucursal",
        });

      const start = Number(start_ts);
      const end = Number(end_ts);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return j(400, { ok: false, error: "Ventana inválida start/end" });
      }

      // Trocear por día en Panamá (fin-exclusivo) y concatenar
      const out: any[] = [];
      let cursor = start;
      // to YMD helper para logs
      const ymdFromEpochPanama = (sec: number) =>
        toPanamaYMD(sec);

      while (cursor < end) {
        const ymd = toPanamaYMD(cursor);
        const dayStart = panamaEpoch00(ymd!);
        const dayEnd = panamaEpoch00(addDaysYMD(ymd!, 1));
        const fini = Math.max(dayStart, cursor);
        const ffin = Math.min(dayEnd, end);

        const url = invuUrlDetalle(fini, ffin);
        const data = await invuFetch(url, token);
        const rows = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : [];
        console.log(
          `[INVU][${ymdFromEpochPanama(fini)}] rows=${rows.length} window=[${fini},${ffin})`
        );
        out.push(...rows);

        cursor = dayEnd; // avanzar exacto por día local
      }

      // Devolver un wrapper homogéneo para que ingest_detalle lo acepte directo
      return j(200, {
        ok: true,
        kind: "detalle",
        count: out.length,
        data: { data: out },
        error: false,
      });
    }

    if (mode === "ingest_detalle") {
      const root = body?.data ?? {};
      const rows = Array.isArray(root?.data?.data)
        ? root.data.data
        : Array.isArray(root?.data)
        ? root.data
        : Array.isArray(root)
        ? root
        : [];
      if (!rows.length)
        return j(200, { ok: true, upserted: 0, reason: "payload vacío" });

      const branch = String(body?.sucursal ?? "").toLowerCase();

      const mapped = rows.map((r: any) => {
        // fecha: proponemos usar fecha_cierre_date si existe; si no, apertura/creación
        const fechaRaw =
          r.fecha_cierre_date ?? r.fecha_creacion ?? r.fecha_apertura_date;
        const fecha = parseFecha(fechaRaw); // YYYY-MM-DD en tz Panamá

        // Totales: busca primero en r.totales y luego campos planos
        const subtotal = N(r?.totales?.subtotal ?? r.subtotal);
        const itbms = N(r?.totales?.tax ?? r.tax);
        const total = N(r?.totales?.total ?? r.total ?? r.total_pagar);
        const propina = N(r?.totales?.propina ?? r.propina);

        const num_items = Array.isArray(r.items)
          ? r.items.length
          : Array.isArray(r.detalle)
          ? r.detalle.length
          : null;

        const invu_id = String(
          r.num_orden ?? r.numero_factura ?? r.id_ord ?? r.id ?? crypto.randomUUID()
        );

        return {
          fecha, // <- YYYY-MM-DD local Panamá (no dependemos de tz_local en DB)
          subtotal,
          itbms,
          total,
          propina,
          num_items,
          sucursal_id: null, // se rellena en otro proceso
          branch, // "costa", "cangrejo", etc.
          invu_id,
          raw: r,
          num_transacciones: 1,
          estado: r.pagada ?? r.status ?? null,
        };
      });

      const { error } = await supabase.from("invu_ventas").upsert(mapped, {
        onConflict: "branch,invu_id",
      });
      if (error)
        return j(500, { ok: false, error: error.message || String(error) });
      return j(200, { ok: true, upserted: mapped.length });
    }

    return j(400, {
      ok: false,
      error: "Modo inválido. Usa: pull_detalle | ingest_detalle",
    });
  } catch (e) {
    console.error("sync-ventas-v12 error:", e);
    return j(500, { ok: false, error: String(e) });
  }
});
