// supabase/functions/sync-empleados/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INVU_BASE_URL = (Deno.env.get("INVU_BASE_URL") ?? "https://api6.invupos.com/invuApiPos/index.php").replace(/\/+$/,'');
const TOKENS_JSON = Deno.env.get("INVU_TOKENS_JSON") ?? "{}";           // opcional (tokens estáticos por sucursal)
const CREDS_JSON  = Deno.env.get("INVU_CREDENTIALS_JSON") ?? "{}";     // recomendado (username/password por sucursal)

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

type Creds = Record<string, { username: string; password: string }>;
type Tokens = Record<string, { token: string }>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" }});
}

const safeParse = <T=unknown>(s: string | null | undefined, fallback: T): T => {
  try { return s ? JSON.parse(s) as T : fallback; } catch { return fallback; }
};

async function invuUserAuth(creds: { username: string; password: string }) {
  const res = await fetch(`${INVU_BASE_URL}/userAuth`, {
    method: "POST",
    headers: { "accept":"application/json", "content-type":"application/json" },
    body: JSON.stringify({ grant_type: "authorization", username: creds.username, password: creds.password }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`userAuth ${res.status}: ${text}`);
  const parsed = JSON.parse(text);
  const token = parsed?.authorization as string | undefined;
  if (!token) throw new Error(`userAuth sin 'authorization': ${text}`);
  return token;
}

async function invuFetchMovimientos(token: string, fini: number, ffin: number) {
  const url = `${INVU_BASE_URL}/index.php?r=empleados/movimientos/fini/${fini}/ffin/${ffin}`;
  const res = await fetch(url, { headers: { "AUTHORIZATION": token, "accept":"application/json" }});
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, data: (()=>{ try { return JSON.parse(text) } catch { return null } })() };
}

async function invuFetchEmpleados(token: string, limit = 500) {
  const url = `${INVU_BASE_URL}/index.php?r=empleados/empleados&limit=${limit}`;
  const res = await fetch(url, { headers: { "AUTHORIZATION": token, "accept":"application/json" }});
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, data: (()=>{ try { return JSON.parse(text) } catch { return null } })() };
}

function normalizeName(nombres?: string | null, apellidos?: string | null) {
  const s = [nombres, apellidos].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return s || null;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ error: "Only POST" }, 405);
    const body = await req.json().catch(() => ({}));
    const sucursal_id = (body?.sucursal_id ?? "").toString();
    const dry_run: boolean = !!body?.dry_run;
    const debug: boolean = !!body?.debug;
    const force: "mov" | "emp" | undefined = body?.force;

    if (!sucursal_id) return json({ ok:false, error:"Falta sucursal_id" }, 400);

    const tokens: Tokens = safeParse(TOKENS_JSON, {});
    const credsAll: Creds = safeParse(CREDS_JSON, {});
    const creds = credsAll[sucursal_id];

    let token = tokens[sucursal_id]?.token;

    // 1) si no hay token estático, intenta userAuth con creds
    if (!token && creds) {
      token = await invuUserAuth(creds);
    }

    // 2) si hay token pero el endpoint responde 403, intenta renovar con userAuth
    const fini = Math.floor(new Date("2021-01-01T00:00:00Z").getTime() / 1000);
    const ffin = Math.floor(new Date("2030-01-01T00:00:00Z").getTime() / 1000);

    let origen: "mov" | "emp" | "none" = "none";
    let empleados: any[] = [];

    const useMov = force ? force === "mov" : true;

    async function tryMovimientos(tok: string) {
      const r = await invuFetchMovimientos(tok, fini, ffin);
      if (debug) console.log("[mov] status", r.status, "body", r.text?.slice(0, 200));
      if (r.ok && Array.isArray(r?.data?.data)) {
        return r.data.data as any[];
      }
      if (r.status === 403 && creds) {
        // token inválido/expirado → renueva
        const fresh = await invuUserAuth(creds);
        const r2 = await invuFetchMovimientos(fresh, fini, ffin);
        if (debug) console.log("[mov/renew] status", r2.status, "body", r2.text?.slice(0, 200));
        if (r2.ok && Array.isArray(r2?.data?.data)) {
          token = fresh;
          return r2.data.data as any[];
        }
      }
      return null;
    }

    async function tryEmpleados(tok: string) {
      const r = await invuFetchEmpleados(tok, 500);
      if (debug) console.log("[emp] status", r.status, "body", r.text?.slice(0, 200));
      if (r.ok && Array.isArray(r?.data?.data)) {
        return r.data.data as any[];
      }
      if (r.status === 403 && creds) {
        const fresh = await invuUserAuth(creds);
        const r2 = await invuFetchEmpleados(fresh, 500);
        if (debug) console.log("[emp/renew] status", r2.status, "body", r2.text?.slice(0, 200));
        if (r2.ok && Array.isArray(r2?.data?.data)) {
          token = fresh;
          return r2.data.data as any[];
        }
      }
      return null;
    }

    if (!token && !creds) {
      return json({ ok:false, error:`No hay token ni credenciales para sucursal_id=${sucursal_id}` }, 400);
    }

    if (useMov && token) {
      const d = await tryMovimientos(token);
      if (Array.isArray(d)) { empleados = d; origen = "mov"; }
    }

    if (empleados.length === 0) {
      // Fallback a empleados si no forzaste "mov"
      if (force !== "mov" && token) {
        const d2 = await tryEmpleados(token);
        if (Array.isArray(d2)) { empleados = d2; origen = "emp"; }
      }
    }

    // Si seguimos sin data, responde y termina (no es error: puede haber cero marcaciones y también bloquear /empleados)
    if (!Array.isArray(empleados) || empleados.length === 0) {
      return json({ ok:true, origen, sucursal_id, upserted:0, note:"Sin data desde INVU (movimientos/empleados)" });
    }

    // Normaliza lista común
    const list = empleados.map((e: any) => {
      // formato esperado en ambos endpoints: { id, nombres, apellidos, email? }
      const invu_id = e?.id ?? e?.idempleado ?? e?.empleado_id ?? null;
      return {
        sucursal_id,
        invu_employee_id: invu_id != null ? String(invu_id) : null,
        nombre: normalizeName(e?.nombres, e?.apellidos),
        email: e?.email ?? null,
        last_synced_at: new Date().toISOString(),
      };
    }).filter(row => row.invu_employee_id !== null);

    if (list.length === 0) {
      return json({ ok:true, origen, sucursal_id, upserted:0, note:"Todos sin id válido" });
    }

    if (dry_run) {
      return json({ ok:true, origen, sucursal_id, preview: list.slice(0, 5), count: list.length });
    }

    const { error: upErr } = await supa
      .from("hr_empleado")
      .upsert(list, { onConflict: "sucursal_id,invu_employee_id" });

    if (upErr) return json({ ok:false, error: upErr.message }, 500);

    return json({ ok:true, origen, sucursal_id, upserted: list.length });
  } catch (err) {
    return json({ ok:false, error: (err as Error).message }, 500);
  }
});
