import { parseCsv } from '../../src/parsers/csvParser';
import { parseExcel } from '../../src/parsers/excelParser';
import {
  ensureLargeXlsx,
  generatePerformanceCsv,
  generatePerformanceExcelBuffer,
  generateLargeCsv,
} from '../helpers/generateFixtures';
import * as fs from 'fs';

describe('性能基准测试', () => {
  beforeAll(() => {
    ensureLargeXlsx();
  });

  describe('CSV 解析性能', () => {
    test('1,000 行 CSV 应在 100ms 内完成', () => {
      const csv = generatePerformanceCsv(1000);

      const start = Date.now();
      const result = parseCsv(csv, 'perf-1k.csv');
      const elapsed = Date.now() - start;

      expect(result.sheets[0].rows).toHaveLength(1000);
      expect(elapsed).toBeLessThan(100);
      console.log(`CSV 1,000 行解析耗时: ${elapsed}ms`);
    });

    test('10,000 行 CSV 应在 500ms 内完成', () => {
      const csv = generatePerformanceCsv(10000);

      const start = Date.now();
      const result = parseCsv(csv, 'perf-10k.csv');
      const elapsed = Date.now() - start;

      expect(result.sheets[0].rows).toHaveLength(10000);
      expect(elapsed).toBeLessThan(500);
      console.log(`CSV 10,000 行解析耗时: ${elapsed}ms`);
    });

    test('100,000 行 CSV 应在 3000ms 内完成', () => {
      const csv = generatePerformanceCsv(100000);

      const start = Date.now();
      const result = parseCsv(csv, 'perf-100k.csv');
      const elapsed = Date.now() - start;

      expect(result.sheets[0].rows).toHaveLength(100000);
      expect(elapsed).toBeLessThan(3000);
      console.log(`CSV 100,000 行解析耗时: ${elapsed}ms`);
    });

    test('宽 CSV（100 列 x 1000 行）应在 500ms 内完成', () => {
      const csv = generateLargeCsv(1000, 100);

      const start = Date.now();
      const result = parseCsv(csv, 'wide-perf.csv');
      const elapsed = Date.now() - start;

      expect(result.sheets[0].headers).toHaveLength(100);
      expect(result.sheets[0].rows).toHaveLength(1000);
      expect(elapsed).toBeLessThan(500);
      console.log(`CSV 1000x100 解析耗时: ${elapsed}ms`);
    });
  });

  describe('Excel 解析性能', () => {
    test('large.xlsx（10,000 行）应在 3000ms 内完成', () => {
      const filePath = ensureLargeXlsx();
      const buffer = fs.readFileSync(filePath);

      const start = Date.now();
      const result = parseExcel(buffer, 'large.xlsx');
      const elapsed = Date.now() - start;

      expect(result.sheets[0].rows).toHaveLength(10000);
      expect(elapsed).toBeLessThan(3000);
      console.log(`Excel 10,000 行解析耗时: ${elapsed}ms`);
    });

    test('内存生成 Excel（5,000 行 x 20 列）应在 2000ms 内完成', () => {
      const buffer = generatePerformanceExcelBuffer(5000, 20);

      const start = Date.now();
      const result = parseExcel(buffer, 'perf-5k-20.xlsx');
      const elapsed = Date.now() - start;

      expect(result.sheets[0].rows).toHaveLength(5000);
      expect(result.sheets[0].headers).toHaveLength(20);
      expect(elapsed).toBeLessThan(2000);
      console.log(`Excel 5000x20 解析耗时: ${elapsed}ms`);
    });

    test('内存生成 Excel（20,000 行 x 10 列）应在 5000ms 内完成', () => {
      const buffer = generatePerformanceExcelBuffer(20000, 10);

      const start = Date.now();
      const result = parseExcel(buffer, 'perf-20k-10.xlsx');
      const elapsed = Date.now() - start;

      expect(result.sheets[0].rows).toHaveLength(20000);
      expect(elapsed).toBeLessThan(5000);
      console.log(`Excel 20,000x10 解析耗时: ${elapsed}ms`);
    });
  });

  describe('内存使用检查', () => {
    test('解析大文件后不应有明显内存泄漏', () => {
      const memBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < 5; i++) {
        const csv = generatePerformanceCsv(10000);
        parseCsv(csv, `leak-test-${i}.csv`);
      }

      global.gc?.();

      const memAfter = process.memoryUsage().heapUsed;
      const memDiffMB = (memAfter - memBefore) / (1024 * 1024);

      console.log(`内存变化: ${memDiffMB.toFixed(2)} MB`);
      expect(memDiffMB).toBeLessThan(200);
    });
  });
});
