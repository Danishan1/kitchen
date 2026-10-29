/** Minimal RFC 4180 CSV writer (Excel-friendly, with BOM option). */
export type CsvValue = string | number | boolean | null | undefined;

export function escapeCsv(v: CsvValue): string {
  if (v == null) return '';
  const s = String(v);
  // Guard against spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) && isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => CsvValue }[], bom = true): string {
  const lines = [columns.map((c) => escapeCsv(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => escapeCsv(c.value(r))).join(','));
  return (bom ? '﻿' : '') + lines.join('\r\n');
}
