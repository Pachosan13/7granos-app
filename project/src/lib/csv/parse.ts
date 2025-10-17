import Papa from 'papaparse';
import { autoMapColumns, applyColumnMapping, validateMappedData, CSV_SCHEMAS, type ColumnMapping } from './columnMapper';

export interface CsvParseResult {
  data: Record<string, any>[];
  originalData: Record<string, any>[];
  headers: string[];
  originalHeaders: string[];
  mappings: ColumnMapping[];
  unmapped: string[];
  missing: string[];
  rowCount: number;
  errors: string[];
}

export interface CsvValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'date';
}

/**
 * Parsear CSV usando PapaParse con auto-mapeo de columnas
 */
export const parseCSV = (
  file: File, 
  schemaType: keyof typeof CSV_SCHEMAS
): Promise<CsvParseResult> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      delimitersToGuess: [',', ';', '\t', '|'],
      encoding: 'UTF-8',
      complete: (results) => {
        try {
          // Headers originales
          const originalHeaders = results.meta.fields || [];
          
          // Limpiar datos originales
          const originalData = results.data.map((row: any) => {
            const cleanRow: Record<string, any> = {};
            Object.keys(row).forEach(key => {
              cleanRow[key] = typeof row[key] === 'string' ? row[key].trim() : row[key];
            });
            return cleanRow;
          });
          
          // Auto-mapear columnas
          const { mappings, unmapped, missing } = autoMapColumns(originalHeaders, schemaType);
          
          // Aplicar mapeo
          const mappedData = applyColumnMapping(originalData, mappings);
          
          // Obtener headers mapeados
          const mappedHeaders = Array.from(new Set([
            ...mappings.map(m => m.target),
            ...unmapped
          ]));
          
          // Validar datos mapeados
          const validationErrors = validateMappedData(mappedData, schemaType);
          
          // Recopilar todos los errores
          const allErrors = [
            ...(results.errors?.map(error => `Fila ${error.row}: ${error.message}`) || []),
            ...validationErrors
          ];
          
          resolve({
            data: mappedData,
            originalData,
            headers: mappedHeaders,
            originalHeaders,
            mappings,
            unmapped,
            missing,
            rowCount: mappedData.length,
            errors: allErrors
          });
        } catch (error) {
          reject(new Error(`Error procesando CSV: ${error instanceof Error ? error.message : 'Error desconocido'}`));
        }
      },
      error: (error) => {
        reject(new Error(`Error parseando CSV: ${error.message}`));
      }
    });
  });
};

/**
 * Parsea CSV de forma segura con manejo de errores
 */
export const safeParseCSV = async (file: File): Promise<{
  rows: Record<string, any>[];
  fields: string[];
  warnings: string[];
}> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        resolve({
          rows: results.data as Record<string, any>[],
          fields: results.meta.fields || [],
          warnings: results.errors?.map(error => `Fila ${error.row}: ${error.message}`) || []
        });
      },
      error: (error) => {
        reject(new Error(`Error parseando CSV: ${error.message}`));
      }
    });
  });
};

/**
 * Validar que el CSV tenga las columnas requeridas
 */
export const validateCSVStructure = (
  result: CsvParseResult,
  requiredFields: CsvValidationRule[]
): string[] => {
  const errors: string[] = [];
  
  // Verificar columnas requeridas
  requiredFields.forEach(rule => {
    if (rule.required && !result.headers.includes(rule.field)) {
      errors.push(`Columna requerida faltante: "${rule.field}"`);
    }
  });
  
  // Validar tipos de datos en una muestra
  if (errors.length === 0 && result.data.length > 0) {
    const sampleSize = Math.min(10, result.data.length);
    const sample = result.data.slice(0, sampleSize);
    
    requiredFields.forEach(rule => {
      if (rule.type && result.headers.includes(rule.field)) {
        sample.forEach((row, idx) => {
          const value = row[rule.field];
          
          if (value !== null && value !== undefined && value !== '') {
            switch (rule.type) {
              case 'number':
                if (isNaN(Number(value))) {
                  errors.push(`Fila ${idx + 1}: "${rule.field}" debe ser un número, encontrado: "${value}"`);
                }
                break;
              case 'date':
                if (isNaN(Date.parse(value))) {
                  errors.push(`Fila ${idx + 1}: "${rule.field}" debe ser una fecha válida, encontrado: "${value}"`);
                }
                break;
            }
          }
        });
      }
    });
  }
  
  return errors;
};

/**
 * Calcular hash SHA-256 de un archivo
 */
export const calculateFileHash = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};