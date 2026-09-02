import { parseExcel } from '../../src/parsers/excelParser';
import {
  generateEmptySheetExcelBuffer,
  generateMultiSheetExcelBuffer,
  generateWideExcelBuffer,
} from '../helpers/generateFixtures';

describe('Excel 解析器 - 边界情况', () => {
  test('应正确处理包含空 Sheet 的 Excel', () => {
    const buffer = generateEmptySheetExcelBuffer();
    const result = parseExcel(buffer, 'empty-sheet.xlsx');

    expect(result.sheets).toHaveLength(2);
    expect(result.sheets[0].name).toBe('有数据');
    expect(result.sheets[0].rows).toHaveLength(1);
    expect(result.sheets[1].name).toBe('空Sheet');
    expect(result.sheets[1].rows).toHaveLength(0);
  });

  test('应正确处理多 Sheet（5 个工作表）Excel', () => {
    const buffer = generateMultiSheetExcelBuffer();
    const result = parseExcel(buffer, 'multi-sheet.xlsx');

    expect(result.sheets).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(result.sheets[i].name).toBe(`工作表${i + 1}`);
      expect(result.sheets[i].rows).toHaveLength(100);
      expect(result.sheets[i].headers).toEqual(['id', 'name', 'value']);
    }
  });

  test('应正确处理宽列 Excel（50 列）', () => {
    const buffer = generateWideExcelBuffer();
    const result = parseExcel(buffer, 'wide.xlsx');
    const sheet = result.sheets[0];

    expect(sheet.headers).toHaveLength(50);
    expect(sheet.rows).toHaveLength(10);
    expect(sheet.headers[0]).toBe('列_1');
    expect(sheet.headers[49]).toBe('列_50');
  });

  test('应正确返回文件名', () => {
    const buffer = generateMultiSheetExcelBuffer();
    const result = parseExcel(buffer, '测试文件_2024.xlsx');

    expect(result.fileName).toBe('测试文件_2024.xlsx');
  });

  test('每个 Sheet 的 headers 应与数据列一致', () => {
    const buffer = generateMultiSheetExcelBuffer();
    const result = parseExcel(buffer, 'test.xlsx');

    for (const sheet of result.sheets) {
      if (sheet.rows.length > 0) {
        const rowKeys = Object.keys(sheet.rows[0]);
        expect(rowKeys).toEqual(sheet.headers);
      }
    }
  });

  test('应正确处理数值精度', () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      { precise: 0.1 + 0.2, integer: 42, big: 9999999999 },
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Precision');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = parseExcel(buffer, 'precision.xlsx');
    const row = result.sheets[0].rows[0];

    expect(typeof row.precise).toBe('number');
    expect(row.integer).toBe(42);
    expect(row.big).toBe(9999999999);
  });

  test('应正确处理含有空字符串的单元格', () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      { a: '有值', b: '', c: '有值' },
      { a: '', b: '有值', c: '' },
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Empty');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = parseExcel(buffer, 'empty-cells.xlsx');
    const sheet = result.sheets[0];

    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0].b).toBe('');
    expect(sheet.rows[1].a).toBe('');
  });

  test('应正确处理中文 Sheet 名称', () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ id: 1 }]);
    XLSX.utils.book_append_sheet(wb, ws, '用户数据表_2024年');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = parseExcel(buffer, 'chinese-sheet.xlsx');
    expect(result.sheets[0].name).toBe('用户数据表_2024年');
  });

  test('应正确处理含有特殊字符的单元格值', () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      { text: '包含\n换行', formula_like: '=SUM(A1:A2)', special: '<html>&amp;"quotes"' },
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Special');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = parseExcel(buffer, 'special-chars.xlsx');
    const row = result.sheets[0].rows[0];

    expect(typeof row.text).toBe('string');
    expect(typeof row.special).toBe('string');
  });
});
