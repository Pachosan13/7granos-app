import * as XLSX from 'xlsx';

const getTodayStamp = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const buildFileName = (suffix: string | null, extension: string) => {
  const today = getTodayStamp();
  const normalizedSuffix = suffix ? `_${suffix.replace(/\s+/g, '_').toLowerCase()}` : '';
  return `contabilidad${normalizedSuffix}_${today}.${extension}`;
};

export const exportToCsv = (
  rows: string[][],
  headers: string[],
  options?: { suffix?: string }
) => {
  if (rows.length === 0) return;
  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = buildFileName(options?.suffix ?? null, 'csv');
  anchor.click();
  URL.revokeObjectURL(anchor.href);
};

export const exportToXlsx = <T extends Record<string, string | number | boolean | null | undefined>>(
  data: T[],
  sheetName: string,
  options?: { suffix?: string }
) => {
  if (data.length === 0) return;
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const fileName = buildFileName(options?.suffix ?? null, 'xlsx');
  XLSX.writeFile(workbook, fileName);
};

export const formatNumber = (value: number) => value.toLocaleString('es-PA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
