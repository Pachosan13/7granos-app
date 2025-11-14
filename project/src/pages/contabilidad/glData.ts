import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { toNumber } from './rpcHelpers';

export interface AccountCatalogEntry {
  code: string;
  name: string;
  type: string;
}

export interface JournalLineRecord {
  account_id: string | null;
  debit: number;
  credit: number;
  meta?: Record<string, unknown> | null;
}

export interface JournalRecord {
  id: string;
  journal_date: string;
  description: string | null;
  sucursal_id: string | null;
  source: string | null;
  source_id: string | null;
  created_at: string | null;
  lines: JournalLineRecord[];
}

interface RawJournalLine {
  account_id?: string | null;
  debit?: number | string | null;
  credit?: number | string | null;
  meta?: Record<string, unknown> | null;
}

interface RawJournalRecord {
  id?: string;
  journal_date?: string;
  description?: string | null;
  sucursal_id?: string | null;
  source?: string | null;
  source_id?: string | null;
  created_at?: string | null;
  contabilidad_journal_line?: RawJournalLine[] | null;
  lines?: RawJournalLine[] | null;
}

export const normalizeAccountType = (value: string | null | undefined): string => {
  if (!value) return '';
  return value.toLowerCase();
};

export const monthKeyFromDate = (isoDate: string): string => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate.slice(0, 7).concat('-01');
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
};

export const getMonthBounds = (month: string): { start: string; end: string } => {
  const [yyyy, mm] = month.split('-').map((part) => Number.parseInt(part, 10));
  const startDate = new Date(Date.UTC(yyyy, (mm || 1) - 1, 1));
  const endDate = new Date(Date.UTC(yyyy, (mm || 1), 0));
  const start = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(
    startDate.getUTCDate()
  ).padStart(2, '0')}`;
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(
    endDate.getUTCDate()
  ).padStart(2, '0')}`;
  return { start, end };
};

export const getMonthSequence = (baseMonthISO: string, count: number): string[] => {
  const base = new Date(baseMonthISO);
  if (Number.isNaN(base.getTime())) return [];
  const out: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const clone = new Date(base);
    clone.setUTCMonth(base.getUTCMonth() - index);
    const yyyy = clone.getUTCFullYear();
    const mm = String(clone.getUTCMonth() + 1).padStart(2, '0');
    out.push(`${yyyy}-${mm}-01`);
  }
  return out;
};

export async function fetchAccountCatalog(): Promise<Record<string, AccountCatalogEntry>> {
  const { data, error } = await supabase
    .from('cont_account')
    .select('code,name,type')
    .eq('is_active', true)
    .order('code');

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data as AccountCatalogEntry[] | null) ?? [];
  return rows.reduce<Record<string, AccountCatalogEntry>>((acc, row) => {
    if (row.code) {
      acc[String(row.code)] = {
        code: String(row.code),
        name: row.name ?? '',
        type: normalizeAccountType(row.type),
      };
    }
    return acc;
  }, {});
}

export async function fetchJournalsInRange(params: {
  from: string;
  to: string;
  sucursalId?: string | null;
}): Promise<JournalRecord[]> {
  const query = supabase
    .from('contabilidad_journal')
    .select(
      `id,journal_date,description,sucursal_id,source,source_id,created_at,lines:contabilidad_journal_line(account_id,debit,credit,meta)`
    )
    .gte('journal_date', params.from)
    .lte('journal_date', params.to)
    .order('journal_date', { ascending: true });

  if (params.sucursalId) {
    query.eq('sucursal_id', params.sucursalId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error((error as PostgrestError).message);
  }

  const rows = (data as RawJournalRecord[] | null) ?? [];
  return rows.map<JournalRecord>((row) => {
    const lines = (row.lines ?? row.contabilidad_journal_line ?? [])
      .filter((line): line is RawJournalLine => Boolean(line))
      .map<JournalLineRecord>((line) => ({
        account_id: line.account_id ?? null,
        debit: toNumber(line.debit),
        credit: toNumber(line.credit),
        meta: line.meta ?? null,
      }));

    return {
      id: row.id ?? '',
      journal_date: row.journal_date ?? '',
      description: row.description ?? null,
      sucursal_id: row.sucursal_id ?? null,
      source: row.source ?? null,
      source_id: row.source_id ?? null,
      created_at: row.created_at ?? null,
      lines,
    };
  });
}
