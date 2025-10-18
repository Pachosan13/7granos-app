const FUNCTIONS_SUFFIX = '/invu-attendance-proxy';

export const isDebug = (): boolean => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('debug') === '1' || import.meta.env.MODE !== 'production';
};

export const getFunctionsBase = (): string => {
  const fromEnv =
    (import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined);
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
  return supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1` : '';
};

export const logEnv = () => {
  if (!isDebug()) return;
  const info = {
    MODE: import.meta.env.MODE,
    VITE_SUPABASE_URL: !!import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_SUPABASE_FUNCTIONS_BASE: !!import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE,
    FUNCTIONS_BASE_RESOLVED: getFunctionsBase(),
  };
  console.info('[diagnostics] Variables de entorno:', info);
};

const pad = (value: number) => String(value).padStart(2, '0');

export const tzPanamaEpoch = (year: number, month: number, day: number, endOfDay = false): number => {
  const suffix = endOfDay ? 'T23:59:59-05:00' : 'T00:00:00-05:00';
  const iso = `${year}-${pad(month)}-${pad(day)}${suffix}`;
  return Math.floor(new Date(iso).getTime() / 1000);
};

export const yesterdayRange = () => {
  const now = new Date();
  const panama = new Date(now.toLocaleString('en-US', { timeZone: 'America/Panama' }));
  panama.setDate(panama.getDate() - 1);

  const año = panama.getFullYear();
  const mes = panama.getMonth() + 1;
  const dia = panama.getDate();
  const desde = `${año}-${pad(mes)}-${pad(dia)}`;
  const fini = tzPanamaEpoch(año, mes, dia, false);
  const ffin = tzPanamaEpoch(año, mes, dia, true);

  return { año, mes, dia, desde, hasta: desde, fini, ffin };
};

export const formatFunctionsHost = () => {
  const base = getFunctionsBase();
  try {
    return base ? new URL(base).host : 'sin configurar';
  } catch {
    return base || 'sin configurar';
  }
};

export const getProxyUrlForYesterday = () => {
  const base = getFunctionsBase();
  if (!base) return '';
  const { fini, ffin } = yesterdayRange();
  return `${base}${FUNCTIONS_SUFFIX}?branch=sf&fini=${fini}&ffin=${ffin}`;
};

export const debugLog = (...args: unknown[]) => {
  if (isDebug()) {
    // eslint-disable-next-line no-console
    console.log('[debug]', ...args);
  }
};

