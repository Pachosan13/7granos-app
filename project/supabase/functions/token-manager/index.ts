import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

interface INVUCredentials {
  sucursal_id: string;
  usuario: string;
  password: string;
  token: string | null;
  token_expires_at: string | null;
}

interface TokenRenewalResult {
  sucursal_id: string;
  success: boolean;
  token?: string;
  expires_at?: string;
  skipped?: boolean;
  error?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ----- Función real para pedir token a INVU -----
async function getInvuToken(username: string, password: string) {
  const res = await fetch("https://api6.invupos.com/invuApiPos/userAuth", {
    method: "POST",
    headers: { "accept": "application/json", "content-type": "application/json" },
    body: JSON.stringify({ username, password, grant_type: "authorization" }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`INVU auth ${res.status} ${txt}`);
  }
  const json = await res.json();
  const token = (json?.authorization ?? json?.token) as string | undefined;
  if (!token) throw new Error("No token in INVU response");
  return token;
}

// Helper: ¿debo renovar?
function needsRenewal(token: string | null, expiresAt: string | null, force: boolean) {
  if (force) return true;
  if (!token) return true;
  if (token.startsWith("mock_")) return true; // 👈 clave para salir del mock
  if (!expiresAt) return true;
  const expMs = Date.parse(expiresAt);
  if (Number.isNaN(expMs)) return true;
  const now = Date.now();
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  return (expMs - now) <= twoDays;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";  // 👈 ?force=1 para forzar

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credentials, error: credError } = await sb
      .from('invu_credenciales')
      .select('sucursal_id, usuario, password, token, token_expires_at');

    if (credError) throw new Error(`Error reading invu_credenciales: ${credError.message}`);
    if (!credentials || credentials.length === 0) throw new Error('No INVU credentials found');

    const results: any[] = [];
    let renewed = 0, skipped = 0, failed = 0;

    for (const cred of credentials) {
      try {
        if (!cred.usuario || !cred.password) {
          failed++;
          await sb.from('sync_log').insert({ proceso: 'token-manager', sucursal_id: cred.sucursal_id, estado: 'ERROR', detalle: 'Missing username/password' });
          results.push({ sucursal_id: cred.sucursal_id, success: false, error: 'Missing username/password' });
          continue;
        }

        const should = needsRenewal(cred.token, cred.token_expires_at, force);

        if (!should) {
          skipped++;
          await sb.from('sync_log').insert({ proceso: 'token-manager', sucursal_id: cred.sucursal_id, estado: 'OK', detalle: 'Token vigente - skip' });
          results.push({ sucursal_id: cred.sucursal_id, success: true, skipped: true, token: cred.token, expires_at: cred.token_expires_at });
          continue;
        }

        const token = await getInvuToken(cred.usuario, cred.password);
        const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

        const { error: updateError } = await sb
          .from('invu_credenciales')
          .update({ token, token_expires_at: expires })
          .eq('sucursal_id', cred.sucursal_id);   // 👈 clave correcta

        if (updateError) throw new Error(`DB update error: ${updateError.message}`);

        await sb.from('sync_log').insert({ proceso: 'token-manager', sucursal_id: cred.sucursal_id, estado: 'OK', detalle: 'Token renovado' });

        renewed++;
        results.push({ sucursal_id: cred.sucursal_id, success: true, token, expires_at: expires });

      } catch (e: any) {
        failed++;
        const msg = String(e?.message ?? e);
        await sb.from('sync_log').insert({ proceso: 'token-manager', sucursal_id: cred.sucursal_id, estado: 'ERROR', detalle: msg });
        results.push({ sucursal_id: cred.sucursal_id, success: false, error: msg });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_processed: results.length,
      successful_renewals: renewed,
      skipped,
      failed_renewals: failed,
      results
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error: any) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseServiceKey) {
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        await sb.from('sync_log').insert({ proceso: 'token-manager', sucursal_id: null, estado: 'ERROR', detalle: `Token manager failed: ${String(error?.message ?? error)}` });
      }
    } catch {}
    return new Response(JSON.stringify({ success: false, error: String(error?.message ?? error) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
