/** 解析结果的统一接口 */
export interface ParsedSheet {
  /** 工作表名称 */
  name: string;
  /** 列头名称数组 */
  headers: string[];
  /** 行数据，每行是一个对象 {列头: 值} */
  rows: Record<string, unknown>[];
}

export interface ParseResult {
  /** 文件名 */
  fileName: string;
  /** 所有工作表 */
  sheets: ParsedSheet[];
  /** CSV 分隔符（仅 CSV/TSV 文件有值） */
  delimiter?: string;
}
