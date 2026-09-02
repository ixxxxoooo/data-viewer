/**
 * 测试夹具动态生成工具
 * 用于在测试前生成大型文件和各种边界情况的测试数据
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const fixturesDir = path.join(__dirname, '..', 'fixtures');

/** 确保 large.xlsx 存在（10000 行，5 列） */
export function ensureLargeXlsx(): string {
  const filePath = path.join(fixturesDir, 'large.xlsx');
  if (fs.existsSync(filePath)) return filePath;

  const categories = ['电子产品', '食品', '服装', '图书', '家居'];
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i <= 10000; i++) {
    rows.push({
      id: i,
      name: `项目_${i}`,
      value: Math.round(Math.random() * 10000) / 100,
      category: categories[i % categories.length],
      timestamp: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

/** 生成超大 CSV 字符串（指定行列数） */
export function generateLargeCsv(rowCount: number, colCount: number): string {
  const headers = Array.from({ length: colCount }, (_, i) => `col_${i + 1}`);
  const lines = [headers.join(',')];

  for (let r = 0; r < rowCount; r++) {
    const row = Array.from({ length: colCount }, (_, c) =>
      c === 0 ? r + 1 : `数据_${r}_${c}`
    );
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

/** 生成包含特殊字符列名的 CSV */
export function generateSpecialHeadersCsv(): string {
  return [
    '名字 (中文),年龄/Age,城市&地区,"带,逗号",带空格 列,123数字开头',
    '张三,25,北京,值1,值2,值3',
    '李四,30,上海,值4,值5,值6',
  ].join('\n');
}

/** 生成包含各种数据类型的 CSV */
export function generateMixedTypesCsv(): string {
  return [
    'integer,float,negative,scientific,boolean_like,date_like,empty_col,chinese,emoji',
    '42,3.14,-100,1.5e10,true,2024-01-01,,你好,😀',
    '0,0.001,-0.5,2e-3,false,2024-12-31,,世界,🎉',
    '999999,99.99999,-999,1E5,TRUE,,,测试,👍',
  ].join('\n');
}

/** 生成只有表头没有数据行的 CSV */
export function generateHeaderOnlyCsv(): string {
  return 'col_a,col_b,col_c\n';
}

/** 生成单列 CSV */
export function generateSingleColumnCsv(): string {
  return 'value\n1\n2\n3\n4\n5\n';
}

/** 生成包含换行符的 CSV 字段 */
export function generateMultilineCsv(): string {
  return [
    'name,description',
    '"张三","这是第一行\n这是第二行"',
    '"李四","包含\n多个\n换行"',
  ].join('\n');
}

/** 生成空 Sheet 的 Excel 文件 Buffer */
export function generateEmptySheetExcelBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet([{ a: 1, b: 2 }]);
  const ws2 = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.book_append_sheet(wb, ws1, '有数据');
  XLSX.utils.book_append_sheet(wb, ws2, '空Sheet');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}

/** 生成多 Sheet Excel 文件 Buffer（5 个 Sheet） */
export function generateMultiSheetExcelBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  for (let s = 1; s <= 5; s++) {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: `Sheet${s}_Row${i + 1}`,
      value: Math.round(Math.random() * 1000) / 10,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, `工作表${s}`);
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}

/** 生成宽列 Excel（50 列） */
export function generateWideExcelBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const rows: Record<string, unknown>[] = [];
  for (let r = 0; r < 10; r++) {
    const row: Record<string, unknown> = {};
    for (let c = 0; c < 50; c++) {
      row[`列_${c + 1}`] = `R${r}C${c}`;
    }
    rows.push(row);
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, '宽表');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}

/** 生成超大行数的 CSV 用于性能测试 */
export function generatePerformanceCsv(rows: number): string {
  const headers = 'id,name,value,category,date';
  const categories = ['A', 'B', 'C', 'D', 'E'];
  const lines = [headers];
  for (let i = 0; i < rows; i++) {
    lines.push(`${i + 1},名称_${i},${(Math.random() * 10000).toFixed(2)},${categories[i % 5]},2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`);
  }
  return lines.join('\n');
}

/** 生成超大 Excel Buffer 用于性能测试 */
export function generatePerformanceExcelBuffer(rows: number, cols: number): Buffer {
  const wb = XLSX.utils.book_new();
  const data: unknown[][] = [];

  const headers = Array.from({ length: cols }, (_, i) => `col_${i + 1}`);
  data.push(headers);

  for (let r = 0; r < rows; r++) {
    const row: unknown[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(c === 0 ? r + 1 : `V_${r}_${c}`);
    }
    data.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Performance');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}
