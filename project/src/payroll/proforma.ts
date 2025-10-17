import { supabase } from '../lib/supabase';

type MapaCuenta = Record<string, { cuenta: string; signo: 1 | -1 }>;

export async function buildProforma(params: { periodoId: string; sucursalId: string; mapa: MapaCuenta }) {
  const { periodoId, sucursalId, mapa } = params;

  const { data: resultados, error: resErr } = await supabase
    .from('hr_resultado')
    .select('empleado_id, bruto, deducciones_legales, deducciones_contractuales, neto, detalle, css_patronal, edu_patronal')
    .eq('periodo_id', periodoId);
  if (resErr) throw new Error('Error leyendo resultados: ' + String(resErr.message));

  const { data: totales, error: totErr } = await supabase
    .from('hr_periodo_totales')
    .select('*')
    .eq('periodo_id', periodoId)
    .single();
  if (totErr) throw new Error('Error leyendo totales: ' + String(totErr.message));

  // Construcción de líneas Debe/Haber a partir de detalle y patronales
  type Linea = { cuenta: string; debe: number; haber: number; nota?: string };
  const lines: Linea[] = [];

  function pushLinea(code: string, monto: number, nota?: string) {
    const map = mapa[code];
    if (!map || !monto) return;
    const cuenta = map.cuenta;
    if (map.signo === 1) lines.push({ cuenta, debe: monto, haber: 0, nota });
    else lines.push({ cuenta, debe: 0, haber: monto, nota });
  }

  // Sumatorio por código de todos los empleados
  const sumByCode: Record<string, number> = {};
  for (const r of (resultados || []) as any[]) {
    const det = (r.detalle || {}) as Record<string, number>;
    for (const [code, monto] of Object.entries(det)) {
      sumByCode[code] = (sumByCode[code] || 0) + Number(monto || 0);
    }
  }

  // Empujar líneas por cada código según mapa
  for (const [code, monto] of Object.entries(sumByCode)) {
    pushLinea(code, Number(monto || 0), 'Detalle planilla ' + code);
  }

  // Patronales: CSS/SE (gasto y pasivo)
  const totalCssPat = Number(totales?.total_css_patronal || 0);
  const totalEduPat = Number(totales?.total_edu_patronal || 0);

  if (totalCssPat > 0) {
    lines.push({ cuenta: 'GASTOS:Planilla:CSS Patronal', debe: totalCssPat, haber: 0, nota: 'CSS patronal' });
    lines.push({ cuenta: 'PASIVO:CSS por pagar (patronal)', debe: 0, haber: totalCssPat, nota: 'CSS patronal' });
  }
  if (totalEduPat > 0) {
    lines.push({ cuenta: 'GASTOS:Planilla:SE Patronal', debe: totalEduPat, haber: 0, nota: 'SE patronal' });
    lines.push({ cuenta: 'PASIVO:SE por pagar (patronal)', debe: 0, haber: totalEduPat, nota: 'SE patronal' });
  }

  // Ajuste por redondeo si hiciera falta
  const totalDebe = lines.reduce((s, l) => s + Number(l.debe || 0), 0);
  const totalHaber = lines.reduce((s, l) => s + Number(l.haber || 0), 0);
  const diff = Math.round((totalDebe - totalHaber) * 100) / 100;
  if (Math.abs(diff) >= 0.01) {
    if (diff > 0) {
      lines.push({ cuenta: 'AJUSTES:Redondeo', debe: 0, haber: Math.abs(diff), nota: 'Ajuste' });
    } else {
      lines.push({ cuenta: 'AJUSTES:Redondeo', debe: Math.abs(diff), haber: 0, nota: 'Ajuste' });
    }
  }

  return {
    header: { periodoId, sucursalId, fecha: new Date().toISOString() },
    lines
  };
}

export async function saveProformaToStorage(periodoId: string, sucursalId: string, json: any) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const path = `uploads/${sucursalId}/proformas/${y}/${m}/${periodoId}.proforma.json`;
  const { error } = await supabase.storage.from('uploads').upload(path, new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), { upsert: true });
  if (error) throw new Error('Error guardando proforma JSON: ' + String(error.message));
  return path;
}