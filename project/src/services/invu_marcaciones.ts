import { getFunctionsBase } from '../utils/diagnostics';

export type InvuBranch = 'sf' | 'museo' | 'cangrejo' | 'costa' | 'central';

type FetchOptions = {
  branch: InvuBranch;
  base?: string;
  timeoutMs?: number;
  path?: string;
};

type FetchByDateOptions = FetchOptions & {
  date: string;
};

type FetchByEpochOptions = FetchOptions & {
  fini: number;
  ffin: number;
};

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_PATH = 'invu-marcaciones';

const sanitizeBase = (base?: string) => base?.replace(/\/+$/, '') ?? '';

const resolveBase = (base?: string) => {
  const resolved = sanitizeBase(base ?? getFunctionsBase());
  if (resolved) return resolved;
  throw new Error('Edge Function no configurada (revisa VITE_SUPABASE_FUNCTIONS_BASE o VITE_SUPABASE_URL).');
};

const normalizeBranch = (branch: InvuBranch) => {
  if (!branch) throw new Error('Sucursal requerida.');
  const validBranches: InvuBranch[] = ['sf', 'museo', 'cangrejo', 'costa', 'central'];
  if (!validBranches.includes(branch)) {
    throw new Error('Sucursal inválida. Usa sf|museo|cangrejo|costa|central.');
  }
  return branch;
};

const fetchMarcaciones = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const text = await res.text().catch(() => '');
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!res.ok) {
      if (payload && typeof payload === 'object') {
        return payload;
      }
      throw new Error(
        text
          ? `Marcaciones error ${res.status}: ${text.slice(0, 200)}`
          : `Marcaciones HTTP ${res.status}`
      );
    }

    if (payload !== null) {
      return payload;
    }

    return {};
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Marcaciones: tiempo de espera agotado');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

export const fetchInvuMarcacionesByDate = async ({
  branch,
  date,
  base,
  timeoutMs = DEFAULT_TIMEOUT,
  path = DEFAULT_PATH,
}: FetchByDateOptions) => {
  const normalizedBranch = normalizeBranch(branch);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Fecha inválida (usa YYYY-MM-DD).');
  }

  const functionsBase = resolveBase(base);
  const endpoint = `${functionsBase}/${path.replace(/^\/+/, '')}?branch=${encodeURIComponent(normalizedBranch)}&date=${encodeURIComponent(date)}`;
  return fetchMarcaciones(endpoint, timeoutMs);
};

export const fetchInvuMarcacionesByEpoch = async ({
  branch,
  fini,
  ffin,
  base,
  timeoutMs = DEFAULT_TIMEOUT,
  path = DEFAULT_PATH,
}: FetchByEpochOptions) => {
  const normalizedBranch = normalizeBranch(branch);
  if (!Number.isFinite(fini) || !Number.isFinite(ffin) || fini > ffin) {
    throw new Error('fini/ffin inválidos.');
  }

  const functionsBase = resolveBase(base);
  const endpoint = `${functionsBase}/${path.replace(/^\/+/, '')}?branch=${encodeURIComponent(normalizedBranch)}&fini=${Math.trunc(fini)}&ffin=${Math.trunc(ffin)}`;
  return fetchMarcaciones(endpoint, timeoutMs);
};
