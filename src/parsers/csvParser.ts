import Papa from 'papaparse';
import { ParseResult, ParsedSheet } from './types';

/**
 * 解析 CSV/TSV 内容
 * 使用 PapaParse 自动检测分隔符，支持带引号字段和换行
 */
export function parseCsv(content: string, fileName: string): ParseResult {
  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  const headers = result.meta.fields ?? [];
  const delimiter = result.meta.delimiter;

  const sheet: ParsedSheet = {
    name: 'Sheet1',
    headers,
    rows: result.data,
  };

  return { fileName, sheets: [sheet], delimiter };
}

/**
 * 从 Buffer 解析 CSV/TSV
 */
export function parseCsvFromBuffer(buffer: Buffer, fileName: string): ParseResult {
  const content = buffer.toString('utf-8');
  return parseCsv(content, fileName);
}

/**
 * 将 ParseResult 序列化回 CSV/TSV 字符串
 * 使用原始分隔符（默认逗号）
 */
export function serializeCsv(result: ParseResult): string {
  const sheet = result.sheets[0];
  if (!sheet) return '';
  return Papa.unparse(sheet.rows, {
    columns: sheet.headers,
    delimiter: result.delimiter || ',',
  });
}
