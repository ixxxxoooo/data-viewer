import { parseCsv, parseCsvFromBuffer } from '../../src/parsers/csvParser';
import {
  generateSpecialHeadersCsv,
  generateMixedTypesCsv,
  generateHeaderOnlyCsv,
  generateSingleColumnCsv,
  generateMultilineCsv,
  generateLargeCsv,
} from '../helpers/generateFixtures';

describe('CSV 解析器 - 边界情况', () => {
  test('应正确处理特殊字符列名', () => {
    const csv = generateSpecialHeadersCsv();
    const result = parseCsv(csv, 'special.csv');
    const sheet = result.sheets[0];

    expect(sheet.headers).toHaveLength(6);
    expect(sheet.headers).toContain('名字 (中文)');
    expect(sheet.headers).toContain('年龄/Age');
    expect(sheet.headers).toContain('城市&地区');
    expect(sheet.headers).toContain('带,逗号');
    expect(sheet.headers).toContain('带空格 列');
    expect(sheet.headers).toContain('123数字开头');
    expect(sheet.rows).toHaveLength(2);
  });

  test('应正确处理混合数据类型', () => {
    const csv = generateMixedTypesCsv();
    const result = parseCsv(csv, 'mixed.csv');
    const sheet = result.sheets[0];

    expect(sheet.rows).toHaveLength(3);
    expect(sheet.rows[0].integer).toBe(42);
    expect(sheet.rows[0].float).toBe(3.14);
    expect(sheet.rows[0].negative).toBe(-100);
    expect(sheet.rows[0].boolean_like).toBe(true);
    expect(sheet.rows[1].boolean_like).toBe(false);
    expect(sheet.rows[0].empty_col).toBeFalsy();
    expect(sheet.rows[0].chinese).toBe('你好');
    expect(sheet.rows[0].emoji).toBe('😀');
  });

  test('应正确处理只有表头的 CSV', () => {
    const csv = generateHeaderOnlyCsv();
    const result = parseCsv(csv, 'header-only.csv');
    const sheet = result.sheets[0];

    expect(sheet.headers).toEqual(['col_a', 'col_b', 'col_c']);
    expect(sheet.rows).toHaveLength(0);
  });

  test('应正确处理单列 CSV', () => {
    const csv = generateSingleColumnCsv();
    const result = parseCsv(csv, 'single.csv');
    const sheet = result.sheets[0];

    expect(sheet.headers).toEqual(['value']);
    expect(sheet.rows).toHaveLength(5);
    expect(sheet.rows[0].value).toBe(1);
  });

  test('应正确处理字段中的换行符', () => {
    const csv = generateMultilineCsv();
    const result = parseCsv(csv, 'multiline.csv');
    const sheet = result.sheets[0];

    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0].description).toContain('\n');
    expect(sheet.rows[0].name).toBe('张三');
  });

  test('应正确处理超长字段值', () => {
    const longValue = 'A'.repeat(10000);
    const csv = `col\n${longValue}`;
    const result = parseCsv(csv, 'long.csv');

    expect(result.sheets[0].rows[0].col).toBe(longValue);
  });

  test('应正确处理含 BOM 头的 UTF-8 CSV', () => {
    const bom = '\uFEFF';
    const csv = `${bom}name,age\n张三,25`;
    const result = parseCsv(csv, 'bom.csv');

    expect(result.sheets[0].rows).toHaveLength(1);
    expect(result.sheets[0].rows[0].age).toBe(25);
  });

  test('应正确处理 Windows 换行符 (CRLF)', () => {
    const csv = 'a,b\r\n1,2\r\n3,4\r\n';
    const result = parseCsv(csv, 'crlf.csv');

    expect(result.sheets[0].rows).toHaveLength(2);
    expect(result.sheets[0].rows[0]).toEqual({ a: 1, b: 2 });
  });

  test('应正确处理分号分隔的 CSV', () => {
    const csv = 'name;age;city\n张三;25;北京\n李四;30;上海';
    const result = parseCsv(csv, 'semicolon.csv');
    const sheet = result.sheets[0];

    expect(sheet.rows).toHaveLength(2);
  });

  test('应正确处理宽 CSV（100 列）', () => {
    const csv = generateLargeCsv(10, 100);
    const result = parseCsv(csv, 'wide.csv');
    const sheet = result.sheets[0];

    expect(sheet.headers).toHaveLength(100);
    expect(sheet.rows).toHaveLength(10);
  });

  test('应正确处理只有一行数据的 CSV', () => {
    const csv = 'x,y,z\n1,2,3';
    const result = parseCsv(csv, 'one-row.csv');

    expect(result.sheets[0].rows).toHaveLength(1);
    expect(result.sheets[0].rows[0]).toEqual({ x: 1, y: 2, z: 3 });
  });

  test('应正确处理含有 null/undefined 类似值的 CSV', () => {
    const csv = 'a,b,c\nnull,undefined,NaN\nNULL,,none';
    const result = parseCsv(csv, 'nullish.csv');
    const sheet = result.sheets[0];

    expect(sheet.rows).toHaveLength(2);
  });

  test('应正确处理日文/韩文等多字节字符', () => {
    const csv = '名前,都市\nたなか,東京\n김철수,서울';
    const result = parseCsv(csv, 'unicode.csv');
    const sheet = result.sheets[0];

    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0]['名前']).toBe('たなか');
    expect(sheet.rows[1]['都市']).toBe('서울');
  });

  test('从 Buffer 解析中文 UTF-8 CSV', () => {
    const csv = 'name,city\n张三,北京\n李四,上海';
    const buffer = Buffer.from(csv, 'utf-8');
    const result = parseCsvFromBuffer(buffer, 'chinese.csv');
    const sheet = result.sheets[0];

    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0].name).toBe('张三');
    expect(sheet.rows[0].city).toBe('北京');
  });

  test('应正确处理列数不一致的行', () => {
    const csv = 'a,b,c\n1,2,3\n4,5\n6,7,8,9';
    const result = parseCsv(csv, 'uneven.csv');
    const sheet = result.sheets[0];

    expect(sheet.rows.length).toBeGreaterThanOrEqual(2);
  });

  test('应正确处理重复列名', () => {
    const csv = 'name,name,name\n1,2,3';
    const result = parseCsv(csv, 'dup-headers.csv');
    const sheet = result.sheets[0];

    expect(sheet.headers.length).toBeGreaterThanOrEqual(1);
    expect(sheet.rows).toHaveLength(1);
  });
});
