import Papa from 'papaparse';
import { ParseResult, ParsedSheet } from './types';

/**
 * 将 CSV 单元格文本转换为存储值，原则是“保存后文件内容不变”（往返安全）：
 * - 空字符串 → null
 * - 仅精确的 true / false → 布尔值
 * - 仅当 String(Number(text)) === text 时才转为数字，
 *   因此 007、1.50、1e3、超过 15 位的长数字（订单号、身份证号）都会保持为字符串
 * - 日期等其他内容一律保持原样（不再像 PapaParse dynamicTyping 那样转成 Date 对象）
 *
 * 该函数对每个单元格调用一次，先用首字符做快速判断，绝大多数文本单元格几乎零开销。
 */
export function convertCsvCell(value: string): unknown {
  const len = value.length;
  if (len === 0) return null;

  const c = value.charCodeAt(0);
  // 数字只可能以 0-9 或 - 开头
  if ((c >= 48 && c <= 57) || c === 45) {
    const n = Number(value);
    if (Number.isFinite(n) && String(n) === value) return n;
    return value;
  }
  if (c === 116 /* t */) return value === 'true' ? true : value;
  if (c === 102 /* f */) return value === 'false' ? false : value;
  return value;
}

/**
 * 解析 CSV/TSV 内容
 * 使用 PapaParse 自动检测分隔符，支持带引号字段和换行
 */
export function parseCsv(content: string, fileName: string): ParseResult {
  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: true,
    // 不使用 dynamicTyping：它会把 007 变成 7、1.50 变成 1.5、日期变成 Date，保存时造成数据被篡改
    transform: convertCsvCell as (value: string) => string,
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
