import { supabase } from '../lib/supabase';

export interface PayrollCalculationResult {
  success: boolean;
  message: string;
  empleadosCalculados: number;
  totalBruto: number;
  totalNeto: number;
}

export interface EmpleadoEntry {
  empleado_id: string;
  code: string;
  monto: number;
  qty: number;
}

export interface DeduccionContractual {
  id: string;
  empleado_id: string;
  tipo: string;
  cuota_periodo: number;
  saldo: number;
  prioridad: number;
}

export interface PayrollResult {
  empleado_id: string;
  bruto: number;
  deducciones_legales: number;
  deducciones_contractuales: number;
  neto: number;
  detalle: Record<string, number>;
  css_patronal: number;
  edu_patronal: number;
  costo_laboral_total: number;
}

interface RuleISRTramo {
  id: number;
  valid_from: string;
  valid_to: string | null;
  bracket_min: number;
  bracket_max: number;
  rate: number;
  fixed_amount: number;
}
interface RuleCSSRate {
  id: number;
  valid_from: string;
  valid_to: string | null;
  employee_pct: number;
  employer_pct: number;
}
interface RuleEDURate {
  id: number;
  valid_from: string;
  valid_to: string | null;
  employee_pct: number;
  employer_pct: number;
}
type OvertimeKind = 'daytime' | 'night' | 'rest_holiday' | 'prolonged_night';
interface RuleOvertime {
  id: number;
  valid_from: string;
  valid_to: string | null;
  kind: OvertimeKind;
  multiplier: number;
}
interface RuleThirteenth {
  id: number;
  year: number;
  installment: number;
  due_date: string;
}
interface RuleConfig {
  sucursal_id: string;
  include_tips_in_css: boolean;
  include_tips_in_isr: boolean;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function safeNumber(n: any, fallback = 0): number {
  const v = Number(n);
  return isFinite(v) ? v : fallback;
}

async function upsertPeriodTotals(periodoId: string) {
  const { data: rows, error } = await supabase
    .from('hr_resultado')
    .select('bruto,deducciones_legales,deducciones_contractuales,neto,css_patronal,edu_patronal,costo_laboral_total')
    .eq('periodo_id', periodoId);
  if (error) throw new Error('Error leyendo hr_resultado para totales: ' + String(error.message));
  if (!rows || rows.length === 0) return;

  const tot = rows.reduce((acc: any, r: any) => {
    acc.total_bruto += Number(r.bruto || 0);
    acc.total_legales_emp += Number(r.deducciones_legales || 0);
    acc.total_contractuales += Number(r.deducciones_contractuales || 0);
    acc.total_neto += Number(r.neto || 0);
    acc.total_css_patronal += Number(r.css_patronal || 0);
    acc.total_edu_patronal += Number(r.edu_patronal || 0);
    acc.total_costo_laboral += Number(r.costo_laboral_total || 0);
    return acc;
  }, { total_bruto:0,total_legales_emp:0,total_contractuales:0,total_neto:0,total_css_patronal:0,total_edu_patronal:0,total_costo_laboral:0 });

  const { error: upsertErr } = await supabase
    .from('hr_periodo_totales')
    .upsert({ periodo_id: periodoId, ...tot }, { onConflict: 'periodo_id' });
  if (upsertErr) throw new Error('Error guardando hr_periodo_totales: ' + String(upsertErr.message));
}

export async function calculatePayroll({
  periodoId,
  sucursalId
}: {
  periodoId: string;
  sucursalId: string;
}): Promise<PayrollCalculationResult> {
  try {
    console.log('Iniciando cálculo de planilla:', { periodoId, sucursalId });

    const { data: periodo, error: periodoError } = await supabase
      .from('hr_periodo')
      .select('*')
      .eq('id', periodoId)
      .single();

    if (periodoError || !periodo) {
      const razon = periodoError && (periodoError as any).message ? (periodoError as any).message : 'No encontrado';
      throw new Error('Error obteniendo periodo: ' + razon);
    }

    const periodoStartDate = new Date(periodo.fecha_inicio);
    const periodoEndDate = new Date(periodo.fecha_fin);

    const { data: isrRules, error: isrError } = await supabase
      .from('rule_isr_tramo')
      .select('*')
      .lte('valid_from', isoDate(periodoEndDate))
      .or('valid_to.gte.' + isoDate(periodoStartDate) + ',valid_to.is.null')
      .order('bracket_min');

    if (isrError) {
      throw new Error('Error obteniendo reglas ISR: ' + String(isrError.message));
    }

    const { data: cssRates, error: cssError } = await supabase
      .from('rule_css_rate')
      .select('*')
      .lte('valid_from', isoDate(periodoEndDate))
      .or('valid_to.gte.' + isoDate(periodoStartDate) + ',valid_to.is.null')
      .single();
    if (cssError || !cssRates) {
      throw new Error('Error obteniendo reglas CSS: ' + String(cssError?.message || 'No encontradas'));
    }

    const { data: eduRates, error: eduError } = await supabase
      .from('rule_edu_rate')
      .select('*')
      .lte('valid_from', isoDate(periodoEndDate))
      .or('valid_to.gte.' + isoDate(periodoStartDate) + ',valid_to.is.null')
      .single();
    if (eduError || !eduRates) {
      throw new Error('Error obteniendo reglas Seguro Educativo: ' + String(eduError?.message || 'No encontradas'));
    }

    const { data: overtimeRules, error: overtimeError } = await supabase
      .from('rule_overtime')
      .select('*')
      .lte('valid_from', isoDate(periodoEndDate))
      .or('valid_to.gte.' + isoDate(periodoStartDate) + ',valid_to.is.null');

    if (overtimeError) {
      throw new Error('Error obteniendo reglas Horas Extra: ' + String(overtimeError.message));
    }
    const overtimeMultipliers = new Map<OvertimeKind, number>(
      (overtimeRules || []).map((r: RuleOvertime) => [r.kind, r.multiplier])
    );

    const { data: ruleConfig, error: configError } = await supabase
      .from('rule_config')
      .select('*')
      .eq('sucursal_id', sucursalId)
      .single();

    let currentRuleConfig: RuleConfig;
    if (configError && (configError as any).code === 'PGRST116') {
      const { data: newConfig, error: insertConfigError } = await supabase
        .from('rule_config')
        .insert({ sucursal_id: sucursalId })
        .select('*')
        .single();
      if (insertConfigError || !newConfig) {
        throw new Error('Error creando config de reglas: ' + String(insertConfigError?.message || 'Desconocido'));
      }
      currentRuleConfig = newConfig as unknown as RuleConfig;
    } else if (configError) {
      throw new Error('Error obteniendo config de reglas: ' + String(configError.message));
    } else {
      currentRuleConfig = ruleConfig as unknown as RuleConfig;
    }

    const { data: entries, error: entriesError } = await supabase
      .from('hr_entry')
      .select('empleado_id, code, monto, qty, hr_codigo!inner(tipo)')
      .eq('periodo_id', periodoId)
      .eq('sucursal_id', sucursalId);

    if (entriesError) {
      throw new Error('Error obteniendo entradas: ' + String(entriesError.message));
    }
    if (!entries || entries.length === 0) {
      return {
        success: false,
        message: 'No hay entradas para calcular en este período',
        empleadosCalculados: 0,
        totalBruto: 0,
        totalNeto: 0
      };
    }

    const { data: deducciones, error: deduccionesError } = await supabase
      .from('hr_deduccion')
      .select('*')
      .eq('sucursal_id', sucursalId)
      .eq('activo', true)
      .gt('saldo', 0)
      .order('prioridad', { ascending: true });

    if (deduccionesError) {
      throw new Error('Error obteniendo deducciones: ' + String(deduccionesError.message));
    }

    const empleadosMap = new Map<string, PayrollResult>();
    const employeeEarningsBreakdown = new Map<
      string,
      { regular: number; overtime: number; tips: number; thirteenthMonth: number; otherEarnings: number }
    >();

    (entries as any[]).forEach((entry) => {
      const empleadoId = String(entry.empleado_id);

      if (!empleadosMap.has(empleadoId)) {
        empleadosMap.set(empleadoId, {
          empleado_id: empleadoId,
          bruto: 0,
          deducciones_legales: 0,
          deducciones_contractuales: 0,
          neto: 0,
          detalle: {}
        });
        employeeEarningsBreakdown.set(empleadoId, {
          regular: 0,
          overtime: 0,
          tips: 0,
          thirteenthMonth: 0,
          otherEarnings: 0
        });
      }

      const resultado = empleadosMap.get(empleadoId)!;
      const breakdown = employeeEarningsBreakdown.get(empleadoId)!;

      const code: string = String(entry.code || '');
      const qty: number = safeNumber(entry.qty, 1);
      const monto: number = safeNumber(entry.monto, 0);

      let earningAmount = monto;

      if (['OT_DAY', 'OT_NIGHT', 'OT_REST_HOLIDAY', 'OT_PROLONGED_NIGHT'].includes(code)) {
        const kindMap: Record<string, OvertimeKind> = {
          OT_DAY: 'daytime',
          OT_NIGHT: 'night',
          OT_REST_HOLIDAY: 'rest_holiday',
          OT_PROLONGED_NIGHT: 'prolonged_night'
        };
        const kind = kindMap[code];
        const multiplier = overtimeMultipliers.get(kind) || 1;
        earningAmount = monto * qty * multiplier;
      } else if (code === 'BASE_SAL') {
        earningAmount = monto;
      } else if (code === 'TIPS') {
        earningAmount = monto;
      } else if (code === 'THIRTEENTH_MONTH') {
        earningAmount = monto;
      }

      if (entry.hr_codigo && entry.hr_codigo.tipo === 'earning') {
        resultado.bruto += earningAmount;
        resultado.detalle[code] = (resultado.detalle[code] || 0) + earningAmount;

        if (code === 'BASE_SAL') breakdown.regular += earningAmount;
        else if (['OT_DAY', 'OT_NIGHT', 'OT_REST_HOLIDAY', 'OT_PROLONGED_NIGHT'].includes(code)) breakdown.overtime += earningAmount;
        else if (code === 'TIPS') breakdown.tips += earningAmount;
        else if (code === 'THIRTEENTH_MONTH') breakdown.thirteenthMonth += earningAmount;
        else breakdown.otherEarnings += earningAmount;
      }
    });

    for (const [empleadoId, resultado] of empleadosMap.entries()) {
      const breakdown = employeeEarningsBreakdown.get(empleadoId)!;

      let totalLegalDeductions = 0;
      let cssBase = breakdown.regular + breakdown.overtime + breakdown.thirteenthMonth + breakdown.otherEarnings;
      let eduBase = cssBase;
      if (currentRuleConfig.include_tips_in_css) {
        cssBase += breakdown.tips;
        eduBase += breakdown.tips;
      }

      const cssDeduction = cssBase * safeNumber((cssRates as any).employee_pct, 0);
      totalLegalDeductions += cssDeduction;
      resultado.detalle['CSS_EMP'] = cssDeduction;

      const eduDeduction = eduBase * safeNumber((eduRates as any).employee_pct, 0);
      totalLegalDeductions += eduDeduction;
      resultado.detalle['EDU_EMP'] = eduDeduction;

      let isrBase = breakdown.regular + breakdown.overtime + breakdown.otherEarnings;
      if (currentRuleConfig.include_tips_in_isr) isrBase += breakdown.tips;

      const periodosAlAnio = periodo.frecuencia === 'quincenal' ? 24 : 12;
      const annualTaxableIncome = isrBase * periodosAlAnio;
      let annualISRDeduction = 0;

      for (const tramo of (isrRules || []) as RuleISRTramo[]) {
        if (annualTaxableIncome > tramo.bracket_min) {
          const upper = Math.min(annualTaxableIncome, tramo.bracket_max);
          const taxableInBracket = Math.max(0, upper - tramo.bracket_min);
          annualISRDeduction += taxableInBracket * tramo.rate;
          if (tramo.fixed_amount) annualISRDeduction += tramo.fixed_amount;
        }
      }
      const isrDeduction = annualISRDeduction / periodosAlAnio;
      totalLegalDeductions += isrDeduction;
      resultado.detalle['ISR'] = isrDeduction;

      resultado.deducciones_legales = totalLegalDeductions;
      let netoProvisional = resultado.bruto - resultado.deducciones_legales;

      let totalDeduccionesContractuales = 0;
      const deduccionesEmpleado = (deducciones || [])
        .filter((d: any) => String(d.empleado_id) === empleadoId)
        .sort((a: any, b: any) => safeNumber(a.prioridad, 1) - safeNumber(b.prioridad, 1));

      const deduccionesActualizadas: Array<{ id: string; nuevoSaldo: number }> = [];

      for (const d of deduccionesEmpleado) {
        if (netoProvisional <= 0) break;
        if (!d || !d.activo || safeNumber(d.saldo, 0) <= 0) continue;

        const cuota = safeNumber(d.cuota_periodo, 0);
        const saldo = safeNumber(d.saldo, 0);
        const montoADescontar = Math.min(cuota, saldo, netoProvisional);

        if (montoADescontar > 0) {
          totalDeduccionesContractuales += montoADescontar;
          netoProvisional -= montoADescontar;

          deduccionesActualizadas.push({
            id: String(d.id),
            nuevoSaldo: saldo - montoADescontar
          });

          const tipo = String(d.tipo || 'DEDUCCION');
          resultado.detalle[tipo] = (resultado.detalle[tipo] || 0) + montoADescontar;
        }
      }

      resultado.deducciones_contractuales = totalDeduccionesContractuales;
      resultado.neto = netoProvisional;

      // Patronales (usan mismas bases CSS/SE del empleado)
      const cssPat = cssBase * Number((cssRates as any).employer_pct || 0);
      const eduPat = eduBase * Number((eduRates as any).employer_pct || 0);
      (resultado as any).css_patronal = cssPat;
      (resultado as any).edu_patronal = eduPat;
      (resultado as any).costo_laboral_total = resultado.neto + cssPat + eduPat;

      if (deduccionesActualizadas.length > 0) {
        await Promise.all(
          deduccionesActualizadas.map(async (ded) => {
            const { error: updateError } = await supabase
              .from('hr_deduccion')
              .update({ saldo: ded.nuevoSaldo })
              .eq('id', ded.id);
            if (updateError) {
              console.error('Error actualizando saldo de deducción:', updateError);
            }
          })
        );
      }
    }

    const resultadosArray = Array.from(empleadosMap.values());

    const { error: resultadosError } = await supabase
      .from('hr_resultado')
      .upsert(
        resultadosArray.map((r) => ({
          periodo_id: periodoId,
          empleado_id: r.empleado_id,
          bruto: r.bruto,
          deducciones_legales: r.deducciones_legales,
          deducciones_contractuales: r.deducciones_contractuales,
          neto: r.neto,
          detalle: r.detalle,
          css_patronal: (r as any).css_patronal ?? 0,
          edu_patronal: (r as any).edu_patronal ?? 0,
          costo_laboral_total: (r as any).costo_laboral_total ?? 0,
        })),
        { onConflict: 'periodo_id,empleado_id' }
      );

    if (resultadosError) {
      throw new Error('Error guardando resultados: ' + String(resultadosError.message));
    }

    const netEntries = resultadosArray.map((r) => ({
      sucursal_id: sucursalId,
      periodo_id: periodoId,
      empleado_id: r.empleado_id,
      code: 'NET',
      qty: 1,
      monto: r.neto,
      centro: null as any
    }));

    const { error: netError } = await supabase
      .from('hr_entry')
      .upsert(netEntries, {
        onConflict: 'sucursal_id,periodo_id,empleado_id,code',
        ignoreDuplicates: false
      });

    if (netError) {
      console.error('Error guardando entradas NET:', netError);
    }

    const { error: periodoUpdateError } = await supabase
      .from('hr_periodo')
      .update({ estado: 'calculado' })
      .eq('id', periodoId);

    if (periodoUpdateError) {
      console.error('Error actualizando estado del período:', periodoUpdateError);
    }

    await upsertPeriodTotals(periodoId);

    const totalBruto = resultadosArray.reduce((sum, r) => sum + safeNumber(r.bruto, 0), 0);
    const totalNeto = resultadosArray.reduce((sum, r) => sum + safeNumber(r.neto, 0), 0);

    console.log('Cálculo completado exitosamente:', {
      empleadosCalculados: resultadosArray.length,
      totalBruto,
      totalNeto
    });

    return {
      success: true,
      message: 'Planilla calculada exitosamente para ' + String(resultadosArray.length) + ' empleados',
      empleadosCalculados: resultadosArray.length,
      totalBruto,
      totalNeto
    };
  } catch (error: any) {
    console.error('Error en calculatePayroll:', error);
    return {
      success: false,
      message: 'Error calculando planilla: ' + String(error?.message ?? 'Error desconocido'),
      empleadosCalculados: 0,
      totalBruto: 0,
      totalNeto: 0
    };
  }
}
