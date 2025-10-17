/**
 * Mapeo automático de columnas CSV para diferentes formatos
 */

export interface ColumnMapping {
  source: string;
  target: string;
}

export interface DatasetSchema {
  name: string;
  requiredFields: string[];
  optionalFields: string[];
  mappings: Record<string, string[]>; // target -> possible source names
}

// Esquemas para diferentes tipos de CSV
export const CSV_SCHEMAS: Record<string, DatasetSchema> = {
  empleados: {
    name: 'Empleados',
    requiredFields: ['personal_identification_number', 'first_name', 'last_name', 'employee_rol', 'is_active'],
    optionalFields: ['email', 'home_phone', 'mobile_phone', 'address', 'birth_date', 'emergency_contact', 'phone_contact'],
    mappings: {
      personal_identification_number: [
        'personal identification number', 'personal_identification_number', 'cedula', 'id_number',
        'identification', 'dni', 'document_number'
      ],
      first_name: [
        'name', 'first_name', 'nombre', 'firstname', 'given_name'
      ],
      last_name: [
        'lastname', 'last_name', 'apellido', 'surname', 'family_name'
      ],
      email: [
        'email', 'correo', 'mail', 'email_address', 'e_mail'
      ],
      employee_rol: [
        'employee rol', 'employee_rol', 'rol', 'role', 'position', 'cargo', 'puesto'
      ],
      is_active: [
        'active? (yes/no)', 'active', 'is_active', 'activo', 'status', 'estado'
      ],
      home_phone: [
        'home phone', 'home_phone', 'telefono_casa', 'phone_home'
      ],
      mobile_phone: [
        'mobile phone', 'mobile_phone', 'celular', 'movil', 'cell_phone'
      ],
      address: [
        'address', 'direccion', 'domicilio', 'location'
      ],
      birth_date: [
        'birth date (yyyy-mm-dd)', 'birth_date', 'fecha_nacimiento', 'birthdate', 'date_of_birth'
      ],
      emergency_contact: [
        'emergency contact', 'emergency_contact', 'contacto_emergencia', 'emergency_name'
      ],
      phone_contact: [
        'phone contact', 'phone_contact', 'telefono_contacto', 'emergency_phone'
      ]
    }
  },
  marcaciones: {
    name: 'Marcaciones de empleados',
    requiredFields: ['empleado'],
    optionalFields: ['total_horas', 'dias_trabajados'],
    mappings: {
      empleado: [
        'empleado', 'employee', 'name', 'nombre', 'emp_name',
        'worker', 'empleado_nombre'
      ],
      total_horas: [
        'total_horas', 'total_hours', 'horas_totales', 'hours_total',
        'total', 'sum', 'suma', 'horas'
      ],
      dias_trabajados: [
        'dias_trabajados', 'days_worked', 'working_days', 'dias',
        'days', 'dias_laborados'
      ]
    }
  },
  planilla: {
    name: 'Planilla de empleados',
    requiredFields: ['empleado', 'codigo', 'monto'],
    optionalFields: ['qty', 'centro'],
    mappings: {
      empleado: [
        'empleado', 'employee', 'name', 'nombre', 'emp_name',
        'd code', 'dcode', 'employee_name', 'worker'
      ],
      codigo: [
        'codigo', 'code', 'd code', 'dcode', 'emp_code', 'employee_code',
        'id', 'emp_id', 'personal identification number', 'identification'
      ],
      monto: [
        'monto', 'amount', 'salary', 'salario', 'total', 'pay',
        'payment', 'wage', 'wages', 'sueldo'
      ],
      qty: [
        'qty', 'quantity', 'cantidad', 'hours', 'horas', 'dias', 'days'
      ],
      centro: [
        'centro', 'center', 'cost_center', 'department', 'dept',
        'departamento', 'area', 'division'
      ]
    }
  },
  ventas: {
    name: 'Ventas INVU',
    requiredFields: ['fecha', 'sucursal', 'total', 'propinas', 'itbms', 'num_transacciones'],
    optionalFields: [],
    mappings: {
      fecha: ['fecha', 'date', 'transaction_date', 'day'],
      sucursal: ['sucursal', 'branch', 'store', 'location'],
      total: ['total', 'amount', 'sales_total', 'revenue'],
      propinas: ['propinas', 'tips', 'gratuity'],
      itbms: ['itbms', 'tax', 'vat', 'impuesto'],
      num_transacciones: ['num_transacciones', 'transactions', 'count', 'qty']
    }
  },
  compras: {
    name: 'Compras',
    requiredFields: ['proveedor', 'factura', 'fecha', 'subtotal', 'itbms', 'total'],
    optionalFields: [],
    mappings: {
      proveedor: ['proveedor', 'supplier', 'vendor', 'provider'],
      factura: ['factura', 'invoice', 'bill', 'document'],
      fecha: ['fecha', 'date', 'invoice_date', 'purchase_date'],
      subtotal: ['subtotal', 'subtotal_amount', 'net_amount'],
      itbms: ['itbms', 'tax', 'vat', 'impuesto'],
      total: ['total', 'total_amount', 'gross_amount']
    }
  }
};

/**
 * Normalizar nombre de columna para comparación
 */
const normalizeColumnName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '_');
};

/**
 * Auto-mapear columnas del CSV a esquema esperado
 */
export const autoMapColumns = (
  headers: string[],
  schemaType: keyof typeof CSV_SCHEMAS
): {
  mappings: ColumnMapping[];
  unmapped: string[];
  missing: string[];
} => {
  const schema = CSV_SCHEMAS[schemaType];
  const normalizedHeaders = headers.map(h => normalizeColumnName(h));
  
  const mappings: ColumnMapping[] = [];
  const unmapped: string[] = [];
  const missing: string[] = [];
  
  // Mapear cada campo requerido y opcional
  const allFields = [...schema.requiredFields, ...schema.optionalFields];
  
  allFields.forEach(targetField => {
    const possibleSources = schema.mappings[targetField] || [];
    const normalizedPossible = possibleSources.map(s => normalizeColumnName(s));
    
    // Buscar coincidencia exacta primero
    let matchIndex = normalizedHeaders.findIndex(h => 
      normalizedPossible.includes(h)
    );
    
    // Si no hay coincidencia exacta, buscar coincidencia parcial
    if (matchIndex === -1) {
      matchIndex = normalizedHeaders.findIndex(h => 
        normalizedPossible.some(p => 
          h.includes(p) || p.includes(h)
        )
      );
    }
    
    if (matchIndex !== -1) {
      mappings.push({
        source: headers[matchIndex],
        target: targetField
      });
    } else if (schema.requiredFields.includes(targetField)) {
      missing.push(targetField);
    }
  });
  
  // Identificar columnas no mapeadas
  headers.forEach(header => {
    if (!mappings.some(m => m.source === header)) {
      unmapped.push(header);
    }
  });
  
  return { mappings, unmapped, missing };
};

/**
 * Aplicar mapeo a los datos
 */
export const applyColumnMapping = (
  data: Record<string, any>[],
  mappings: ColumnMapping[]
): Record<string, any>[] => {
  return data.map(row => {
    const mappedRow: Record<string, any> = {};
    
    mappings.forEach(mapping => {
      mappedRow[mapping.target] = row[mapping.source];
    });
    
    // Mantener columnas no mapeadas también
    Object.keys(row).forEach(key => {
      if (!mappings.some(m => m.source === key)) {
        mappedRow[key] = row[key];
      }
    });
    
    return mappedRow;
  });
};

/**
 * Validar que los datos mapeados tengan los campos requeridos
 */
export const validateMappedData = (
  data: Record<string, any>[],
  schemaType: keyof typeof CSV_SCHEMAS
): string[] => {
  const schema = CSV_SCHEMAS[schemaType];
  const errors: string[] = [];
  
  if (data.length === 0) {
    errors.push('El archivo está vacío');
    return errors;
  }
  
  // Verificar que todas las filas tengan los campos requeridos
  const sampleSize = Math.min(10, data.length);
  const sample = data.slice(0, sampleSize);
  
  schema.requiredFields.forEach(field => {
    let emptyCount = 0;
    sample.forEach((row, idx) => {
      const value = row[field];
      if (value === null || value === undefined || value === '') {
        emptyCount++;
        if (emptyCount <= 3) { // Solo mostrar los primeros 3 errores
          errors.push(`Fila ${idx + 1}: "${field}" está vacío`);
        }
      }
    });
    
    if (emptyCount > 3) {
      errors.push(`...y ${emptyCount - 3} filas más con "${field}" vacío`);
    }
  });
  
  return errors;
};