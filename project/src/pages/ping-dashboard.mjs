#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const TARGET_BRANCH = process.env.PING_SUCURSAL_ID || null;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[ping:dashboard] Faltan credenciales. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (o usa SUPABASE_URL/SUPABASE_ANON_KEY).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Panama',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function isoPanama(daysAgo = 0) {
  const now = Date.now();
  const date = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
  return formatter.format(date);
}

const hasta = isoPanama(0);
const desde = isoPanama(6);

const basePayload = { desde, hasta, sucursal_id: null };
const branchPayload = TARGET_BRANCH ? { desde, hasta, sucursal_id: TARGET_BRANCH } : null;

async function ping(fn, payload) {
  const { error } = await supabase.rpc(fn, payload);
  if (error) {
    throw new Error(`${fn} fallo: ${error.message}`);
  }
  console.log(`✅ ${fn}(${JSON.stringify(payload)})`);
}

async function main() {
  const payloads = [basePayload, branchPayload].filter(Boolean);
  const functions = [
    'api_dashboard_summary_7d',
    'rpc_ui_series_14d',
    'api_dashboard_top_productos_7d',
  ];

  for (const fn of functions) {
    for (const payload of payloads) {
      await ping(fn, payload);
    }
  }

  console.log('[ping:dashboard] OK');
}

main().catch((error) => {
  console.error('[ping:dashboard] ERROR', error.message);
  process.exit(1);
});
