/**
 * Procesador especial para CSV de marcaciones de empleados
 * Formato: empleados en filas, fechas en columnas
 */

interface MarcacionEmpleado {
  empleado: string;
  fechas: { [fecha: string]: number }; // fecha -> horas
  totalHoras: number;
  diasTrabajados: number;
}

interface MarcacionesResult {
  empleados: MarcacionEmpleado[];
  fechasColumbnas: string[];
  periodo: { inicio: string; fin: string };
  totales: {
    totalHorasGeneral: number;
    totalDiasTrabajados: number;
    promedioHorasPorDia: number;
  };
}

/**
 * Detectar si un CSV es de marcaciones (formato fecha)
 */
export const isMarcacionesCSV = (headers: string[]): boolean => {
  // Buscar patrones de fecha en los headers (después de la primera columna)
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/, // 2025-08-01
    /^\d{4}_\d{2}_\d{2}$/, // 2025_08_01
    /^\d{2}\/\d{2}\/\d{4}$/, // 08/01/2025
    /^\d{2}-\d{2}-\d{4}$/, // 08-01-2025
  ];

  const possibleDateHeaders = headers.slice(1); // Excluir primera columna (empleado)
  const dateHeaderCount = possibleDateHeaders.filter(header => 
    datePatterns.some(pattern => pattern.test(header.trim()))
  ).length;

  // Si más del 50% de las columnas parecen fechas, es CSV de marcaciones
  return dateHeaderCount > possibleDateHeaders.length * 0.5;
};

/**
 * Procesar CSV de marcaciones
 */
export const processMarcacionesCSV = (
  data: Record<string, any>[],
  headers: string[]
): MarcacionesResult => {
  const empleadoColumn = headers[0]; // Primera columna siempre es empleado
  const fechaColumns = headers.slice(1); // Resto son fechas
  
  // Limpiar y validar fechas
  const validFechas = fechaColumns.filter(header => {
    const cleaned = header.trim();
    return cleaned && cleaned !== '';
  }).sort();

  const empleados: MarcacionEmpleado[] = [];
  let totalHorasGeneral = 0;
  let totalDiasTrabajados = 0;

  data.forEach(row => {
    const empleadoNombre = String(row[empleadoColumn] || '').trim();
    if (!empleadoNombre) return;

    const fechas: { [fecha: string]: number } = {};
    let totalHorasEmpleado = 0;
    let diasTrabajadosEmpleado = 0;

    validFechas.forEach(fechaCol => {
      const horasStr = String(row[fechaCol] || '').trim();
      let horas = 0;

      if (horasStr && horasStr !== '' && horasStr !== '0') {
        // Intentar parsear horas (puede venir como "8.5" o "8:30")
        if (horasStr.includes(':')) {
          // Formato HH:MM
          const [h, m] = horasStr.split(':');
          horas = parseInt(h) + (parseInt(m) / 60);
        } else {
          // Formato decimal
          horas = parseFloat(horasStr);
        }

        if (!isNaN(horas) && horas > 0) {
          fechas[fechaCol] = horas;
          totalHorasEmpleado += horas;
          diasTrabajadosEmpleado++;
        }
      }
    });

    if (totalHorasEmpleado > 0) {
      empleados.push({
        empleado: empleadoNombre,
        fechas,
        totalHoras: Math.round(totalHorasEmpleado * 100) / 100,
        diasTrabajados: diasTrabajadosEmpleado
      });

      totalHorasGeneral += totalHorasEmpleado;
      totalDiasTrabajados += diasTrabajadosEmpleado;
    }
  });

  // Determinar período
  let periodo = { inicio: '', fin: '' };
  if (validFechas.length > 0) {
    periodo = {
      inicio: validFechas[0],
      fin: validFechas[validFechas.length - 1]
    };
  }

  return {
    empleados,
    fechasColumbnas: validFechas,
    periodo,
    totales: {
      totalHorasGeneral: Math.round(totalHorasGeneral * 100) / 100,
      totalDiasTrabajados,
      promedioHorasPorDia: empleados.length > 0 
        ? Math.round((totalHorasGeneral / totalDiasTrabajados) * 100) / 100 
        : 0
    }
  };
};

/**
 * Convertir marcaciones a formato estándar para vista previa
 */
export const marcacionesToPreviewData = (result: MarcacionesResult): Record<string, any>[] => {
  return result.empleados.map(emp => ({
    empleado: emp.empleado,
    total_horas: emp.totalHoras,
    dias_trabajados: emp.diasTrabajados,
    promedio_horas_dia: emp.diasTrabajados > 0 
      ? Math.round((emp.totalHoras / emp.diasTrabajados) * 100) / 100 
      : 0
  }));
};

/**
 * Generar resumen de marcaciones para el manifiesto
 */
export const generateMarcacionesSummary = (result: MarcacionesResult) => {
  const empleadosPorHoras = result.empleados.reduce((acc, emp) => {
    const rango = Math.floor(emp.totalHoras / 40) * 40; // Agrupar por rangos de 40 horas
    const label = `${rango}-${rango + 39} horas`;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    periodo: result.periodo,
    totalEmpleados: result.empleados.length,
    totalHoras: result.totales.totalHorasGeneral,
    totalDias: result.totales.totalDiasTrabajados,
    promedioHoras: result.totales.promedioHorasPorDia,
    distribucionHoras: empleadosPorHoras
  };
};