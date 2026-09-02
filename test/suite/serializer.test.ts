import { parseCsv, serializeCsv } from '../../src/parsers/csvParser';
import { parseExcel, serializeExcel } from '../../src/parsers/excelParser';
import { ParseResult } from '../../src/parsers/types';
import { generateMultiSheetExcelBuffer } from '../helpers/generateFixtures';

describe('CSV 序列化', () => {
  test('应正确将 ParseResult 序列化回 CSV', () => {
    const original = 'name,age,city\n张三,25,北京\n李四,30,上海';
    const parsed = parseCsv(original, 'test.csv');
    const serialized = serializeCsv(parsed);

    const reParsed = parseCsv(serialized, 'test.csv');
    expect(reParsed.sheets[0].rows).toHaveLength(2);
    expect(reParsed.sheets[0].rows[0]).toEqual({ name: '张三', age: 25, city: '北京' });
    expect(reParsed.sheets[0].rows[1]).toEqual({ name: '李四', age: 30, city: '上海' });
  });

  test('应保留原始分隔符（TSV）', () => {
    const original = 'name\tage\tcity\nAlice\t25\tNew York';
    const parsed = parseCsv(original, 'test.tsv');

    expect(parsed.delimiter).toBe('\t');

    const serialized = serializeCsv(parsed);
    expect(serialized).toContain('\t');

    const reParsed = parseCsv(serialized, 'test.tsv');
    expect(reParsed.sheets[0].rows[0]).toEqual({ name: 'Alice', age: 25, city: 'New York' });
  });

  test('应正确处理编辑后的数据', () => {
    const original = 'a,b\n1,hello\n2,world';
    const parsed = parseCsv(original, 'edit.csv');

    parsed.sheets[0].rows[0].b = '修改后';
    parsed.sheets[0].rows[1].a = 99;

    const serialized = serializeCsv(parsed);
    const reParsed = parseCsv(serialized, 'edit.csv');

    expect(reParsed.sheets[0].rows[0].b).toBe('修改后');
    expect(reParsed.sheets[0].rows[1].a).toBe(99);
  });

  test('应正确处理空数据', () => {
    const result: ParseResult = {
      fileName: 'empty.csv',
      sheets: [{ name: 'Sheet1', headers: ['a', 'b'], rows: [] }],
    };
    const serialized = serializeCsv(result);
    const reParsed = parseCsv(serialized, 'empty.csv');
    expect(reParsed.sheets[0].rows).toHaveLength(0);
  });

  test('应正确处理含逗号的字段值', () => {
    const original = 'name,desc\n张三,"包含,逗号"';
    const parsed = parseCsv(original, 'comma.csv');
    const serialized = serializeCsv(parsed);
    const reParsed = parseCsv(serialized, 'comma.csv');

    expect(reParsed.sheets[0].rows[0].desc).toBe('包含,逗号');
  });

  test('应仅输出 headers 中声明的列', () => {
    const parsed = parseCsv('x,y\n1,2', 'test.csv');
    (parsed.sheets[0].rows[0] as any).__dvIdx = 0;
    const serialized = serializeCsv(parsed);

    expect(serialized).not.toContain('__dvIdx');
  });
});

describe('Excel 序列化', () => {
  test('应正确序列化并反序列化 Excel', () => {
    const buffer = generateMultiSheetExcelBuffer();
    const parsed = parseExcel(buffer, 'multi.xlsx');

    const reBuffer = serializeExcel(parsed);
    const reParsed = parseExcel(reBuffer, 'multi.xlsx');

    expect(reParsed.sheets).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(reParsed.sheets[i].name).toBe(`工作表${i + 1}`);
      expect(reParsed.sheets[i].rows).toHaveLength(100);
      expect(reParsed.sheets[i].headers).toEqual(['id', 'name', 'value']);
    }
  });

  test('应正确处理编辑后的 Excel 数据', () => {
    const buffer = generateMultiSheetExcelBuffer();
    const parsed = parseExcel(buffer, 'edit.xlsx');

    parsed.sheets[0].rows[0].name = '修改后的值';
    parsed.sheets[0].rows[0].id = 9999;

    const reBuffer = serializeExcel(parsed);
    const reParsed = parseExcel(reBuffer, 'edit.xlsx');

    expect(reParsed.sheets[0].rows[0].name).toBe('修改后的值');
    expect(reParsed.sheets[0].rows[0].id).toBe(9999);
  });

  test('序列化时应排除内部字段（__dvIdx 等）', () => {
    const buffer = generateMultiSheetExcelBuffer();
    const parsed = parseExcel(buffer, 'clean.xlsx');

    (parsed.sheets[0].rows[0] as any).__dvIdx = 0;
    (parsed.sheets[0].rows[0] as any).__internal = 'test';

    const reBuffer = serializeExcel(parsed);
    const reParsed = parseExcel(reBuffer, 'clean.xlsx');

    expect(reParsed.sheets[0].headers).not.toContain('__dvIdx');
    expect(reParsed.sheets[0].headers).not.toContain('__internal');
    expect(reParsed.sheets[0].headers).toEqual(['id', 'name', 'value']);
  });

  test('序列化性能应在 1 秒内完成（5 个 Sheet x 100 行）', () => {
    const buffer = generateMultiSheetExcelBuffer();
    const parsed = parseExcel(buffer, 'perf.xlsx');

    const start = Date.now();
    serializeExcel(parsed);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    console.log(`Excel 序列化耗时: ${elapsed}ms`);
  });
});
