import * as XLSX from 'xlsx';
import { ParseResult, ParsedSheet } from './types';

/**
 * 解析 Excel 文件 Buffer
 * 支持 .xlsx / .xls，自动提取所有工作表
 */
export function parseExcel(buffer: Buffer, fileName: string): ParseResult {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: false,
    cellHTML: false,
    cellText: false,
    dense: true,
  });

  const sheets: ParsedSheet[] = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const ref = worksheet?.['!ref'];
    if (!ref) {
      return { name: sheetName, headers: [], rows: [] };
    }

    const data = (worksheet as any)['!data'] as (XLSX.CellObject | undefined)[][] | undefined;
    if (data && data.length > 0) {
      const headerRow = data[0] || [];
      const validCols: number[] = [];
      const validHeaders: string[] = [];
      for (let c = 0; c < headerRow.length; c++) {
        const cell = headerRow[c];
        if (cell && cell.v != null && String(cell.v).trim() !== '') {
          validCols.push(c);
          validHeaders.push(String(cell.v));
        }
      }

      if (validHeaders.length === 0) {
        return { name: sheetName, headers: [], rows: [] };
      }

      const rows: Record<string, unknown>[] = [];
      for (let r = 1; r < data.length; r++) {
        const rowArr = data[r];
        if (!rowArr) continue;
        let hasData = false;
        const clean: Record<string, unknown> = {};
        for (let i = 0; i < validCols.length; i++) {
          const cell = rowArr[validCols[i]];
          const val = (cell && cell.v != null) ? cell.v : '';
          if (val !== '') hasData = true;
          clean[validHeaders[i]] = val;
        }
        if (hasData) {
          rows.push(clean);
        }
      }

      return { name: sheetName, headers: validHeaders, rows };
    }

    // 回退到常规单元格寻址（针对非 dense 或特殊兼容情况）
    const range = XLSX.utils.decode_range(ref);
    const validHeaders: string[] = [];
    const validCols: number[] = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
      const cell = worksheet[cellAddr];
      if (cell && cell.v != null && String(cell.v).trim() !== '') {
        validHeaders.push(String(cell.v));
        validCols.push(col);
      }
    }

    if (validHeaders.length === 0) {
      return { name: sheetName, headers: [], rows: [] };
    }

    const rows: Record<string, unknown>[] = [];
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      let hasData = false;
      const clean: Record<string, unknown> = {};
      for (let i = 0; i < validCols.length; i++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c: validCols[i] });
        const cell = worksheet[cellAddr];
        const val = (cell && cell.v != null) ? cell.v : '';
        if (val !== '') hasData = true;
        clean[validHeaders[i]] = val;
      }
      if (hasData) {
        rows.push(clean);
      }
    }

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
