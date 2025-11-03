// supabase/functions/ext-canal-ingest/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Row = {
  proveedor: string;                 // 'PedidosYa'
  sucursal_id?: string | null;       // UUID directo (si lo tienes)
  sucursal_slug?: string | null;     // 'costa' | 'cangrejo' | 'sf' | 'museo' | 'central'
  fecha: string;                     // 'YYYY-MM-DD'
  bruto?: number | string | null;
  comision?: number | string | null;
  referencia?: string | null;
  raw?: any;
};

const N = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

async function mapSucursalId(supabase: any, slug?: string | null) {
  if (!slug) return null;
  const { data } = await supabase
    .from("sucursal")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
}

async function getProveedorId(supabase: any, nombre: string) {
  const { data, error } = await supabase
    .from("ext_ventas_proveedor")
    .select("id")
    .eq("nombre", nombre)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return data.id;

  const ins = await supabase
    .from("ext_ventas_proveedor")
    .insert({ nombre, activo: true })
    .select("id")
    .single();
  if (ins.error) throw ins.error;
  return ins.data.id;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!rows.length) {
      return new Response(JSON.stringify({ ok: true, upserted: 0, reason: "payload vacío" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Resolver proveedor_id (mismo para todas las filas si es constante)
    const provNombre = rows[0]?.proveedor ?? "PedidosYa";
    const proveedor_id = await getProveedorId(supabase, provNombre);

    // Mapear y completar sucursal_id si vino por slug
    const mapped = [];
    for (const r of rows) {
      let sucursal_id = r.sucursal_id ?? null;
      if (!sucursal_id && r.sucursal_slug) {
        sucursal_id = await mapSucursalId(supabase, r.sucursal_slug);
      }
      if (!sucursal_id) continue; // no insertamos si no se puede resolver

      mapped.push({
        proveedor_id,
        sucursal_id,
        fecha: r.fecha,
        bruto: N(r.bruto),
        comision: N(r.comision),
        referencia: r.referencia ?? null,
        raw: r.raw ?? null,
      });
    }

    if (!mapped.length) {
      return new Response(JSON.stringify({ ok: true, upserted: 0, reason: "sin filas válidas" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase
      .from("ext_ventas_canal")
      .upsert(mapped, { onConflict: "proveedor_id,sucursal_id,fecha,coalesce(referencia,'')" });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, upserted: mapped.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
