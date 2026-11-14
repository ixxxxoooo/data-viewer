import * as fs from 'fs';
import * as path from 'path';
import { parseCsv, parseCsvFromBuffer, serializeCsv } from '../../src/parsers/csvParser';

const fixturesDir = path.join(__dirname, '..', 'fixtures');

describe('CSV 解析器', () => {
  test('应正确解析基本 CSV 内容', () => {
    const csv = 'name,age,city\n张三,25,北京\n李四,30,上海';
    const result = parseCsv(csv, 'test.csv');

    expect(result.fileName).toBe('test.csv');
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].name).toBe('Sheet1');
    expect(result.sheets[0].headers).toEqual(['name', 'age', 'city']);
    expect(result.sheets[0].rows).toHaveLength(2);
    expect(result.sheets[0].rows[0]).toEqual({ name: '张三', age: 25, city: '北京' });
    expect(result.sheets[0].rows[1]).toEqual({ name: '李四', age: 30, city: '上海' });
  });

  test('应正确处理带引号的字段', () => {
    const csv = 'name,desc\n"张三","包含,逗号"\n"李四","包含""引号"""';
    const result = parseCsv(csv, 'quoted.csv');

    expect(result.sheets[0].rows[0]).toEqual({ name: '张三', desc: '包含,逗号' });
    expect(result.sheets[0].rows[1]).toEqual({ name: '李四', desc: '包含"引号"' });
  });

  test('应自动检测 TSV 分隔符', () => {
    const tsv = 'name\tage\tcity\nAlice\t25\tNew York\nBob\t30\tLondon';
    const result = parseCsv(tsv, 'test.tsv');

    expect(result.sheets[0].headers).toEqual(['name', 'age', 'city']);
    expect(result.sheets[0].rows).toHaveLength(2);
    expect(result.sheets[0].rows[0]).toEqual({ name: 'Alice', age: 25, city: 'New York' });
  });

  test('应跳过空行', () => {
    const csv = 'a,b\n1,2\n\n3,4\n';
    const result = parseCsv(csv, 'empty.csv');
    expect(result.sheets[0].rows).toHaveLength(2);
  });

  test('应将规范的数字自动转换为 number', () => {
    const csv = 'val,str\n42,hello\n3.14,world';
    const result = parseCsv(csv, 'types.csv');

    expect(result.sheets[0].rows[0]).toEqual({ val: 42, str: 'hello' });
    expect(result.sheets[0].rows[1]).toEqual({ val: 3.14, str: 'world' });
  });

  test('规范的数字转为 number，且保留前导零/末尾零/科学计数法/长数字原文', () => {
    const csv = [
      'id,price,code,big,sci,neg',
      '007,1.50,0123,12345678901234567890,1e3,-5',
    ].join('\n');
    const row = parseCsv(csv, 'safe.csv').sheets[0].rows[0];

    expect(row.id).toBe('007');
    expect(row.price).toBe('1.50');
    expect(row.code).toBe('0123');
    expect(row.big).toBe('12345678901234567890');
    expect(row.sci).toBe('1e3');
    expect(row.neg).toBe(-5);
  });

  test('日期保持字符串，不转为 Date 对象', () => {
    const csv = 'd\n2024-01-01\n2024-12-31T10:00:00Z';
    const rows = parseCsv(csv, 'date.csv').sheets[0].rows;

    expect(rows[0].d).toBe('2024-01-01');
    expect(rows[1].d).toBe('2024-12-31T10:00:00Z');
  });

  test('仅精确的 true/false 转为布尔值', () => {
    const csv = 'b\ntrue\nfalse\nTRUE\ntruely';
    const rows = parseCsv(csv, 'bool.csv').sheets[0].rows;

    expect(rows[0].b).toBe(true);
    expect(rows[1].b).toBe(false);
    expect(rows[2].b).toBe('TRUE');
    expect(rows[3].b).toBe('truely');
  });

  test('解析后再序列化，文件内容应保持不变（往返安全）', () => {
    const csv = [
      'id,price,date,flag,big,note',
      '007,1.50,2024-01-01,TRUE,12345678901234567890,hello',
      '008,88.0,2024-12-31,false,42,"a,b"',
    ].join('\r\n');
    const result = parseCsv(csv, 'roundtrip.csv');

    expect(serializeCsv(result)).toBe(csv);
  });

  test('应从 Buffer 解析 CSV 文件', () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'sample.csv'));
    const result = parseCsvFromBuffer(buffer, 'sample.csv');

    expect(result.fileName).toBe('sample.csv');
    expect(result.sheets[0].headers).toEqual(['name', 'age', 'city', 'score']);
    expect(result.sheets[0].rows).toHaveLength(5);
    expect(result.sheets[0].rows[0].name).toBe('张三');
    expect(result.sheets[0].rows[0].age).toBe(25);
  });

  test('应从 Buffer 解析 TSV 文件', () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'sample.tsv'));
    const result = parseCsvFromBuffer(buffer, 'sample.tsv');

    expect(result.sheets[0].headers).toEqual(['name', 'age', 'city']);
    expect(result.sheets[0].rows).toHaveLength(2);
  });

  test('应处理空内容', () => {
    const result = parseCsv('', 'empty.csv');
    expect(result.sheets[0].rows).toHaveLength(0);
  });
});
