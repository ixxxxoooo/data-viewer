import * as XLSX from 'xlsx';
import { ParseResult, ParsedSheet } from './types';

/**
 * 解析 Excel 文件 Buffer
 * 支持 .xlsx / .xls，自动提取所有工作表
 */
export function parseExcel(buffer: Buffer, fileName: string): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheets: ParsedSheet[] = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const ref = worksheet['!ref'];
    if (!ref) {
      return { name: sheetName, headers: [], rows: [] };
    }

    // 从第一行单元格提取真实列头，跳过空列头
    const range = XLSX.utils.decode_range(ref);
    const validHeaders: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
      const cell = worksheet[cellAddr];
      if (cell && cell.v != null && String(cell.v).trim() !== '') {
        validHeaders.push(String(cell.v));
      }
    }

    // 不使用 defval，让 SheetJS 自动跳过无数据的列
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

    // 只保留真实列头对应的字段，过滤掉 __EMPTY 等占位列
    const rows = jsonData.map((row) => {
      const clean: Record<string, unknown> = {};
      for (const h of validHeaders) {
        clean[h] = row[h] ?? '';
      }
      return clean;
    });

    return { name: sheetName, headers: validHeaders, rows };
  });

  return { fileName, sheets };
}

/**
 * 将 ParseResult 序列化为 Excel Buffer
 * 仅输出 headers 中声明的列，排除内部字段
 */
export function serializeExcel(result: ParseResult): Buffer {
  const workbook = XLSX.utils.book_new();

  for (const sheet of result.sheets) {
    const cleanRows = sheet.rows.map((row) => {
      const clean: Record<string, unknown> = {};
      for (const h of sheet.headers) {
        clean[h] = row[h];
      }
      return clean;
    });
    const ws = XLSX.utils.json_to_sheet(cleanRows, { header: sheet.headers });
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  }

  return Buffer.from(
    XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer
  );
}
