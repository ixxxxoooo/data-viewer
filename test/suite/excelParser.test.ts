import * as fs from 'fs';
import * as path from 'path';
import { parseExcel } from '../../src/parsers/excelParser';

const fixturesDir = path.join(__dirname, '..', 'fixtures');

describe('Excel 解析器', () => {
  test('应正确解析 XLSX 文件', () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'sample.xlsx'));
    const result = parseExcel(buffer, 'sample.xlsx');

    expect(result.fileName).toBe('sample.xlsx');
    expect(result.sheets).toHaveLength(2);
  });

  test('应正确解析第一个 Sheet 的数据', () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'sample.xlsx'));
    const result = parseExcel(buffer, 'sample.xlsx');

    const sheet1 = result.sheets[0];
    expect(sheet1.name).toBe('用户表');
    expect(sheet1.headers).toEqual(['name', 'age', 'city', 'score']);
    expect(sheet1.rows).toHaveLength(3);
    expect(sheet1.rows[0]).toEqual({ name: '张三', age: 25, city: '北京', score: 92.5 });
  });

  test('应正确解析第二个 Sheet 的数据', () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'sample.xlsx'));
    const result = parseExcel(buffer, 'sample.xlsx');

    const sheet2 = result.sheets[1];
    expect(sheet2.name).toBe('订单表');
    expect(sheet2.headers).toEqual(['order_id', 'product', 'amount']);
    expect(sheet2.rows).toHaveLength(2);
    expect(sheet2.rows[0]).toEqual({ order_id: '001', product: '笔记本', amount: 5999 });
  });

  test('应高性能解析大型 XLSX（10000行）', () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'large.xlsx'));

    const start = Date.now();
    const result = parseExcel(buffer, 'large.xlsx');
    const elapsed = Date.now() - start;

    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].rows).toHaveLength(10000);
    expect(result.sheets[0].headers).toEqual(['id', 'name', 'value', 'category', 'timestamp']);

    // 10000 行应在 5 秒内完成解析
    expect(elapsed).toBeLessThan(5000);
    console.log(`大型 XLSX 解析耗时: ${elapsed}ms`);
  });

  test('应正确解析真实生产文件', () => {
    const realFile = path.join(__dirname, '..', '..', '..', '下线的数据表.xlsx');
    if (!fs.existsSync(realFile)) {
      console.log('跳过: 真实文件不存在');
      return;
    }

    const buffer = fs.readFileSync(realFile);
    const start = Date.now();
    const result = parseExcel(buffer, '下线的数据表.xlsx');
    const elapsed = Date.now() - start;

    expect(result.sheets.length).toBeGreaterThan(0);
    const sheet = result.sheets[0];
    expect(sheet.rows.length).toBeGreaterThan(1000);
    expect(sheet.headers).toContain('table_name');

    // 约 18000 行应在 5 秒内完成
    expect(elapsed).toBeLessThan(5000);
    console.log(`真实文件解析: ${sheet.rows.length} 行, 耗时 ${elapsed}ms`);
  });
});
