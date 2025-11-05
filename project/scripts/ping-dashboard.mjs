#!/usr/bin/env node
import process from 'node:process';

const formatDate = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const ensureFetch = async () => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  const mod = await import('cross-fetch');
  return mod.fetch;
};

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
};

const main = async () => {
  const SUPABASE_URL = requireEnv('VITE_SUPABASE_URL');
  const SUPABASE_KEY = requireEnv('VITE_SUPABASE_ANON_KEY');
  const fetchImpl = await ensureFetch();

  const today = new Date();
  const hasta = formatDate(today);
  const desdeDate = new Date(today);
  desdeDate.setDate(desdeDate.getDate() - 6);
  const desde = formatDate(desdeDate);

  const basePayload = {
    p_desde: desde,
    p_hasta: hasta,
    p_sucursal_id: null,
  };

  const endpoints = [
    'api_dashboard_planilla_snapshot',
    'api_dashboard_top_productos_7d',
    'api_dashboard_summary_7d',
  ];

  const callRpc = async (endpoint) => {
    const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/${endpoint}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(basePayload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`RPC ${endpoint} failed with ${response.status}: ${text}`);
    }

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error(`RPC ${endpoint} returned invalid JSON`);
    }

    if (payload === null) {
      throw new Error(`RPC ${endpoint} returned null payload`);
    }
    if (Array.isArray(payload)) {
      if (payload.length === 0) {
        throw new Error(`RPC ${endpoint} returned empty array`);
      }
    } else if (typeof payload === 'object') {
      if (Object.keys(payload).length === 0) {
        throw new Error(`RPC ${endpoint} returned empty object`);
      }
    }

    console.log(`✔ ${endpoint} OK (${Array.isArray(payload) ? payload.length : 'object'} items)`);
  };

  for (const endpoint of endpoints) {
    await callRpc(endpoint);
  }

  console.log('All dashboard RPCs responded successfully.');
};

main().catch((error) => {
  console.error('ping:dashboard failed');
  console.error(error.message || error);
  process.exit(1);
});
