// src/lib/csv/fromStorage.ts
// -------------------------------------------------------------
// Utilidades para listar y leer CSVs de planilla desde Storage.
// Estructura esperada en el bucket "uploads":
//   uploads/{sucursalId}/planilla/{año}/{mes}/{timestamp}-{slug}.csv
//   (opcionalmente también puede haber archivos sueltos en la raíz)
// -------------------------------------------------------------

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// === Cliente Supabase local (sin alias @) ====================

let _supabase: SupabaseClient | null = null;
const getSupabase = (): SupabaseClient => {
  if (_supabase) return _supabase;

  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  if (!url || !anon) {
    throw new Error(
      'Faltan variables VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el entorno.'
    );
  }

  _supabase = createClient(url, anon, { auth: { persistSession: false } });
  return _supabase!;
};

// === Tipos ===================================================

export type StorageFile = {
  name: string;
  path: string;
  size: number;
  lastModified: string;
  type: 'csv' | 'manifest' | string;
};

export type CSVManifest = {
  originalName?: string;
  uploadedAt?: string;
  rows?: number;
  delimiter?: string;
  encoding?: string;
  [k: string]: any;
};

// === Constantes ==============================================

export const UPLOADS_BUCKET = 'uploads';

// === Helpers =================================================

/** En la respuesta de Supabase, las carpetas suelen venir con metadata === null */
const isFolder = (item: any) => !item?.metadata;

/** Reemplaza el sufijo .csv por .manifest.json */
export const csvPathToManifestPath = (csvPath: string) =>
  csvPath.replace(/\.csv$/i, '.manifest.json');

/** Lee y parsea JSON de Storage; si no existe, devuelve null sin lanzar error. */
const safeReadJSONFromStorage = async <T = any>(
  bucket: string,
  path: string
): Promise<T | null> => {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  const text = await data.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

/** Descarga un archivo de texto del storage y lo devuelve como string. */
const downloadText = async (bucket: string, path: string): Promise<string> => {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw error ?? new Error('No se pudo descargar el archivo');
  }
  return data.text();
};

/**
 * Parser CSV sencillo (sin dependencias). Tolera comas o punto y coma como separador.
 * NOTA: es un parser básico (no maneja comillas escapadas complejas). Útil para logs/plantillas simples.
 */
const simpleCSVParse = (raw: string): { headers: string[]; rows: Record<string, string>[] } => {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  // Heurística de delimitador
  const first = lines[0];
  const delimiter = first.includes(';') && !first.includes(',') ? ';' : ',';

  const split = (line: string) => line.split(delimiter).map((s) => s.trim());
  const headers = split(first).map((h) => h.replace(/^"|"$/g, ''));

  const rows = lines.slice(1).map((line) => {
    const cols = split(line).map((c) => c.replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? '';
    });
    return obj;
  });

  return { headers, rows };
};

// === Listados ================================================

/**
 * Lista TODOS los CSVs de planilla para una sucursal, recorriendo subcarpetas {año}/{mes}
 * y también archivos sueltos en la raíz "planilla".
 */
export async function listPlanillaCSVs(sucursalId: string): Promise<StorageFile[]> {
  const supabase = getSupabase();
  const bucket = UPLOADS_BUCKET;
  const basePath = `${sucursalId}/planilla`;

  try {
    const csvFiles: StorageFile[] = [];

    // 1) Listar raíz (pueden existir CSVs sueltos)
    const { data: rootItems, error: rootErr } = await supabase.storage
      .from(bucket)
      .list(basePath, { limit: 100, sortBy: { column: 'updated_at', order: 'desc' } });

    if (rootErr) {
      console.error('Error listando raíz planilla:', rootErr);
      return [];
    }

    for (const item of rootItems ?? []) {
      if (!isFolder(item) && item.name.toLowerCase().endsWith('.csv')) {
        csvFiles.push({
          name: item.name,
          path: `${basePath}/${item.name}`,
          size: item.metadata?.size ?? 0,
          lastModified: (item as any).updated_at || (item as any).created_at || '',
          type: 'csv',
        });
      }
    }

    // 2) Subcarpetas: años
    const yearFolders = (rootItems ?? []).filter(isFolder);
    for (const year of yearFolders) {
      const yearPath = `${basePath}/${year.name}`;
      const { data: monthItems, error: monthErr } = await supabase.storage
        .from(bucket)
        .list(yearPath, { limit: 100, sortBy: { column: 'name', order: 'desc' } });

      if (monthErr) {
        console.error(`Error listando meses en ${yearPath}:`, monthErr);
        continue;
      }

      // 3) Subcarpetas: meses
      const monthFolders = (monthItems ?? []).filter(isFolder);
      for (const month of monthFolders) {
        const monthPath = `${yearPath}/${month.name}`;
        const { data: files, error: filesErr } = await supabase.storage
          .from(bucket)
          .list(monthPath, { limit: 200, sortBy: { column: 'updated_at', order: 'desc' } });

        if (filesErr) {
          console.error(`Error listando archivos en ${monthPath}:`, filesErr);
          continue;
        }

        for (const f of files ?? []) {
          if (!isFolder(f) && f.name.toLowerCase().endsWith('.csv')) {
            csvFiles.push({
              name: f.name,
              path: `${monthPath}/${f.name}`,
              size: f.metadata?.size ?? 0,
              lastModified: (f as any).updated_at || (f as any).created_at || '',
              type: 'csv',
            });
          }
        }
      }
    }

    // Ordenar por última modificación desc
    csvFiles.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1));
    return csvFiles;
  } catch (e) {
    console.error('Error en listPlanillaCSVs (recursivo):', e);
    return [];
  }
}

/**
 * Listado genérico de CSVs bajo un prefijo (útil si en el futuro hay otros tipos: "deducciones", etc.)
 * Ejemplo: listCSVByType(sucursalId, 'entradas') -> recorre {sucursalId}/entradas/{año}/{mes}/...
 */
export async function listCSVByType(sucursalId: string, tipo: string): Promise<StorageFile[]> {
  const supabase = getSupabase();
  const bucket = UPLOADS_BUCKET;
  const basePath = `${sucursalId}/${tipo}`;

  try {
    const csvFiles: StorageFile[] = [];

    const { data: rootItems, error: rootErr } = await supabase.storage
      .from(bucket)
      .list(basePath, { limit: 100, sortBy: { column: 'updated_at', order: 'desc' } });

    if (rootErr) {
      console.error(`Error listando raíz ${basePath}:`, rootErr);
      return [];
    }

    // CSVs sueltos en la raíz
    for (const item of rootItems ?? []) {
      if (!isFolder(item) && item.name.toLowerCase().endsWith('.csv')) {
        csvFiles.push({
          name: item.name,
          path: `${basePath}/${item.name}`,
          size: item.metadata?.size ?? 0,
          lastModified: (item as any).updated_at || (item as any).created_at || '',
          type: 'csv',
        });
      }
    }

    // Años
    const yearFolders = (rootItems ?? []).filter(isFolder);
    for (const year of yearFolders) {
      const yearPath = `${basePath}/${year.name}`;
      const { data: monthItems, error: monthErr } = await supabase.storage
        .from(bucket)
        .list(yearPath, { limit: 100, sortBy: { column: 'name', order: 'desc' } });

      if (monthErr) {
        console.error(`Error listando meses en ${yearPath}:`, monthErr);
        continue;
      }

      const monthFolders = (monthItems ?? []).filter(isFolder);
      for (const month of monthFolders) {
        const monthPath = `${yearPath}/${month.name}`;
        const { data: files, error: filesErr } = await supabase.storage
          .from(bucket)
          .list(monthPath, { limit: 200, sortBy: { column: 'updated_at', order: 'desc' } });

        if (filesErr) {
          console.error(`Error listando archivos en ${monthPath}:`, filesErr);
          continue;
        }

        for (const f of files ?? []) {
          if (!isFolder(f) && f.name.toLowerCase().endsWith('.csv')) {
            csvFiles.push({
              name: f.name,
              path: `${monthPath}/${f.name}`,
              size: f.metadata?.size ?? 0,
              lastModified: (f as any).updated_at || (f as any).created_at || '',
              type: 'csv',
            });
          }
        }
      }
    }

    csvFiles.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1));
    return csvFiles;
  } catch (e) {
    console.error('Error en listCSVByType:', e);
    return [];
  }
}

// === Lectura de manifiestos / CSV ============================

/** Carga el manifiesto JSON correspondiente a un CSV (.csv → .manifest.json). */
export async function getCSVManifest(csvPath: string): Promise<CSVManifest | null> {
  const manifestPath = csvPathToManifestPath(csvPath);
  return safeReadJSONFromStorage<CSVManifest>(UPLOADS_BUCKET, manifestPath);
}

/**
 * Descarga el CSV y lo parsea con un parser sencillo. Devuelve filas y el texto original.
 * Si prefieres manejar el parseo afuera, usa downloadCSV().
 */
export async function downloadAndParseCSV(
  csvPath: string
): Promise<{ rows: Record<string, string>[]; raw: string }> {
  const raw = await downloadText(UPLOADS_BUCKET, csvPath);
  const { rows } = simpleCSVParse(raw);
  return { rows, raw };
}

/** Descarga el CSV como string (sin parsear). */
export async function downloadCSV(csvPath: string): Promise<string> {
  return downloadText(UPLOADS_BUCKET, csvPath);
}

// === Compatibilidad: listado con manifiestos =================

/**
 * Devuelve los CSVs de planilla junto con su manifiesto (si existe).
 * Mantiene compatibilidad con imports existentes: getCSVsWithManifests(sucursalId)
 */
export async function getCSVsWithManifests(sucursalId: string) {
  const csvs = await listPlanillaCSVs(sucursalId);
  const enriched = await Promise.all(
    csvs.map(async (csv) => {
      const manifest = await getCSVManifest(csv.path);
      return { ...csv, manifest };
    })
  );
  return enriched;
}

// === Default export (opcional, por compatibilidad) ===========
const defaultExport = {
  UPLOADS_BUCKET,
  listPlanillaCSVs,
  listCSVByType,
  getCSVManifest,
  downloadAndParseCSV,
  downloadCSV,
  getCSVsWithManifests,
  csvPathToManifestPath,
};

export default defaultExport;
