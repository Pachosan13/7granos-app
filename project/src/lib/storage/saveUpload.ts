import { supabase } from '../supabase';
import { calculateFileHash } from '../csv/parse';

export interface UploadManifest {
  sucursalId: string;
  filename: string;
  originalName: string;
  rows: number;
  columns: string[];
  hash: string;
  uploadedBy: string;
  uploadedAt: string;
  period?: {
    mes: number;
    año: number;
  };
  totals?: Record<string, number>;
  source: 'csv' | 'api';
  tipo: 'planilla' | 'ventas' | 'compras' | 'empleados';
}

/**
 * Generar path para archivo en Storage
 */
const generateStoragePath = (
  sucursalId: string,
  tipo: 'planilla' | 'ventas' | 'compras' | 'empleados',
  filename: string
): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const timestamp = now.getTime();
  
  const slug = filename
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
    
  return `${sucursalId}/${tipo}/${year}/${month}/${timestamp}-${slug}`;
};

/**
 * Guardar datos de empleados en la base de datos
 */
const saveEmpleadosData = async (data: Record<string, any>[], sucursalId: string) => {
  const empleados = data.map(row => ({
    personal_identification_number: String(row.codigo || row.personal_identification_number || ''),
    first_name: String(row.empleado || row.first_name || '').split(' ')[0] || '',
    last_name: String(row.empleado || row.last_name || '').split(' ').slice(1).join(' ') || '',
    email: String(row.email || ''),
    employee_rol: String(row.employee_rol || 'empleado'),
    is_active: true,
    sucursal_id: sucursalId,
    salary: parseFloat(row.monto || row.salary || '0'),
    hours_worked: parseFloat(row.total_horas || row.hours_worked || '0')
  })).filter(emp => emp.personal_identification_number && emp.first_name);

  if (empleados.length > 0) {
    const { error } = await supabase
      .from('empleados')
      .upsert(empleados, {
        onConflict: 'personal_identification_number'
      });
      
    if (error) {
      throw new Error(`Error guardando empleados: ${error.message}`);
    }
    
    console.log(`Guardados ${empleados.length} empleados`);
  }
};

/**
 * Guardar datos de ventas en la base de datos
 */
const saveVentasData = async (data: Record<string, any>[], sucursalId: string) => {
  const ventas = data.map(row => ({
    sucursal_id: sucursalId,
    fecha: row.fecha || new Date().toISOString().split('T')[0],
    total: parseFloat(row.total || '0'),
    propinas: parseFloat(row.propinas || '0'),
    itbms: parseFloat(row.itbms || '0'),
    num_transacciones: parseInt(row.num_transacciones || '0'),
    origen: 'csv' as const
  })).filter(venta => venta.fecha && venta.total > 0);

  if (ventas.length > 0) {
    const { error } = await supabase
      .from('ventas')
      .upsert(ventas, {
        onConflict: 'sucursal_id,fecha'
      });
      
    if (error) {
      throw new Error(`Error guardando ventas: ${error.message}`);
    }
    
    console.log(`Guardadas ${ventas.length} ventas`);
  }
};

/**
 * Guardar datos de compras en la base de datos
 */
const saveComprasData = async (data: Record<string, any>[], sucursalId: string) => {
  const compras = data.map(row => ({
    sucursal_id: sucursalId,
    proveedor: String(row.proveedor || ''),
    factura: String(row.factura || ''),
    fecha: row.fecha || new Date().toISOString().split('T')[0],
    subtotal: parseFloat(row.subtotal || '0'),
    itbms: parseFloat(row.itbms || '0'),
    total: parseFloat(row.total || '0'),
    origen: 'csv' as const
  })).filter(compra => compra.proveedor && compra.factura && compra.total > 0);

  if (compras.length > 0) {
    const { error } = await supabase
      .from('compras')
      .upsert(compras, {
        onConflict: 'sucursal_id,factura'
      });
      
    if (error) {
      throw new Error(`Error guardando compras: ${error.message}`);
    }
    
    console.log(`Guardadas ${compras.length} compras`);
  }
};

/**
 * Subir archivo CSV, crear manifiesto Y guardar datos en BD
 */
export const saveUpload = async (
  file: File,
  sucursalId: string,
  tipo: 'planilla' | 'ventas' | 'compras' | 'empleados',
  metadata: {
    rows: number;
    columns: string[];
    period?: { mes: number; año: number };
    totals?: Record<string, number>;
  },
  csvData?: Record<string, any>[]
): Promise<{ filePath: string; manifestPath: string }> => {
  try {
    // 1. Verificar autenticación
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Usuario no autenticado');
    }

    // 2. Guardar datos en la base de datos primero
    if (csvData && csvData.length > 0) {
      console.log(`Guardando ${csvData.length} registros de ${tipo} en BD...`);
      
      switch (tipo) {
        case 'planilla':
          await saveEmpleadosData(csvData, sucursalId);
          break;
        case 'empleados':
          await saveEmpleadosData(csvData, sucursalId);
          break;
        case 'ventas':
          await saveVentasData(csvData, sucursalId);
          break;
        case 'compras':
          await saveComprasData(csvData, sucursalId);
          break;
      }
      
      console.log(`Datos de ${tipo} guardados exitosamente en BD`);
    }

    // 3. Calcular hash del archivo
    const hash = await calculateFileHash(file);
    
    // 4. Generar paths
    const basePath = generateStoragePath(sucursalId, tipo, file.name);
    const filePath = `${basePath}.csv`;
    const manifestPath = `${basePath}.manifest.json`;
    
    console.log('Subiendo archivo a:', filePath);
    
    // 5. Subir archivo CSV
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(filePath, file, {
        contentType: 'text/csv',
        upsert: false
      });
      
    if (uploadError) {
      console.error('Error subiendo CSV:', uploadError);
      throw new Error(`Error subiendo archivo: ${uploadError.message}`);
    }
    
    console.log('Archivo CSV subido exitosamente');
    
    // 6. Crear manifiesto
    const manifest: UploadManifest = {
      sucursalId,
      filename: file.name,
      originalName: file.name,
      rows: metadata.rows,
      columns: metadata.columns,
      hash,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
      period: metadata.period,
      totals: metadata.totals,
      source: 'csv',
      tipo
    };
    
    // 7. Subir manifiesto JSON
    const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json'
    });
    
    console.log('Subiendo manifiesto a:', manifestPath);
    
    const { error: manifestError } = await supabase.storage
      .from('uploads')
      .upload(manifestPath, manifestBlob, {
        contentType: 'application/json',
        upsert: false
      });
      
    if (manifestError) {
      console.error('Error subiendo manifiesto:', manifestError);
      await supabase.storage.from('uploads').remove([filePath]);
      throw new Error(`Error subiendo manifiesto: ${manifestError.message}`);
    }
    
    console.log('Manifiesto subido exitosamente');
    
    return { filePath, manifestPath };
    
  } catch (error) {
    console.error('Error en saveUpload:', error);
    throw error;
  }
};

/**
 * Registrar sincronización en sync_log
 */
export const logSync = async (
  sucursalId: string,
  tipo: 'planilla' | 'ventas' | 'compras' | 'empleados',
  origen: 'csv' | 'api',
  estado: 'ok' | 'error' | 'pendiente',
  mensaje: string,
  filePath?: string,
  manifestPath?: string
) => {
  try {
    console.log('Registrando en sync_log:', { sucursalId, tipo, origen, estado, mensaje });
    
    const { error } = await supabase
      .from('sync_log')
      .insert({
        sucursal_id: sucursalId,
        tipo,
        origen,
        estado,
        mensaje,
        file_path: filePath,
        manifest_path: manifestPath,
        finished_at: estado !== 'pendiente' ? new Date().toISOString() : null
      });
      
    if (error) {
      console.error('Error registrando sync_log:', error);
      // No lanzar error, solo logear
    } else {
      console.log('sync_log registrado exitosamente');
    }
  } catch (error) {
    console.error('Error en logSync:', error);
    // No lanzar error, solo logear
  }
};

/**
 * Actualizar cursor de sincronización
 */
export const updateSyncCursor = async (
  sucursalId: string,
  dataset: 'ventas' | 'compras' | 'inventario' | 'productos'
) => {
  try {
    console.log('Actualizando cursor:', { sucursalId, dataset });
    
    const { error } = await supabase
      .from('invu_cursor')
      .upsert({
        sucursal_id: sucursalId,
        dataset,
        last_sync_at: new Date().toISOString()
      }, {
        onConflict: 'sucursal_id,dataset'
      });
      
    if (error) {
      console.error('Error actualizando cursor:', error);
      // No lanzar error, solo logear
    } else {
      console.log('Cursor actualizado exitosamente');
    }
  } catch (error) {
    console.error('Error en updateSyncCursor:', error);
    // No lanzar error, solo logear
  }
};