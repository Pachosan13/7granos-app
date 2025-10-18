import { useEffect, useMemo, useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { pingSupabase } from '../lib/supabase';
import { formatFunctionsHost, getFunctionsBase, isDebug, logEnv } from '../utils/diagnostics';

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const debugMode = isDebug();
  const [supabasePing, setSupabasePing] = useState<{ ok: boolean; status: number; note: string } | null>(null);
  const envSummary = useMemo(() => {
    const supabaseUrlOk = Boolean(import.meta.env.VITE_SUPABASE_URL);
    const supabaseAnonOk = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);
    const functionsBase = getFunctionsBase();
    return {
      supabaseUrlOk,
      supabaseAnonOk,
      functionsBase,
      functionsHost: formatFunctionsHost(),
      envOk: supabaseUrlOk && supabaseAnonOk && Boolean(functionsBase),
    };
  }, []);

  useEffect(() => {
    if (!debugMode) return;
    logEnv();
    let mounted = true;
    pingSupabase()
      .then(result => mounted && setSupabasePing(result))
      .catch(err => {
        if (mounted) {
          setSupabasePing({
            ok: false,
            status: 0,
            note: err instanceof Error ? err.message : 'Error inesperado en pingSupabase',
          });
        }
      });
    return () => {
      mounted = false;
    };
  }, [debugMode]);

  return (
    <div className="min-h-screen bg-sand flex flex-col">
      {debugMode && (
        <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm px-4 py-2 flex flex-wrap items-center gap-3">
          <strong>DEBUG MODE</strong>
          <span>
            Entorno: {envSummary.envOk ? 'ok' : 'faltan variables (revisa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)'}
          </span>
          <span>
            Supabase ping:{' '}
            {supabasePing
              ? `${supabasePing.ok ? 'ok' : 'falló'} (status ${supabasePing.status || 'n/a'}) — ${supabasePing.note}`
              : 'verificando…'}
          </span>
          <span>Functions: {envSummary.functionsHost}</span>
        </div>
      )}
      <Header onToggleMenu={() => setMenuOpen((v) => !v)} />
      <div className="flex flex-1">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};
