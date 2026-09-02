# 数据表查看器 (Data Viewer)

<p align="center">
  <img src="images/icon.png" alt="数据表查看器" width="128" height="128">
</p>

<p align="center">
  高性能 CSV/Excel 数据表查看器 VS Code 扩展，支持虚拟滚动、筛选、排序。
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ixxxxoooo.data-viewer"><img src="https://img.shields.io/visual-studio-marketplace/v/ixxxxoooo.data-viewer?style=flat-square&label=%E7%89%88%E6%9C%AC" alt="版本"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF%E8%AF%81-MIT-blue?style=flat-square" alt="MIT License"></a>
</p>

---

## 功能特性

- **CSV/TSV 支持** — 自动检测分隔符（逗号、制表符、分号等），支持带引号字段
- **Excel 支持** — 读取 `.xlsx` / `.xls` 文件，支持多 Sheet 切换
- **虚拟滚动** — 基于 AG Grid，轻松处理 10 万行以上数据
- **全列快速搜索** — 一键搜索所有列的内容
- **独立列筛选** — 每列支持浮动筛选器，自动区分数字列和文本列
- **列排序** — 点击列头排序，支持多列排序
- **行号列** — 固定在左侧的行号，方便定位
- **主题适配** — 自动适配 VS Code 浅色/深色/高对比度主题
- **状态栏** — 显示文件名、行数、筛选后行数、文件大小、解析耗时
- **Unicode 支持** — 完整支持中文、日文、韩文等多字节字符

## 截图

打开 CSV/Excel 文件后，扩展会自动以数据表格式呈现：

```
┌──────────────────────────────────────────────┐
│ [搜索全部列...]                    状态信息   │
├────┬──────────┬──────┬──────┬────────────────┤
│ #  │ name     │ age  │ city │ score          │
│    │ [筛选]   │[筛选]│[筛选]│ [筛选]         │
├────┼──────────┼──────┼──────┼────────────────┤
│ 1  │ 张三     │ 25   │ 北京 │ 92.5           │
│ 2  │ 李四     │ 30   │ 上海 │ 88.0           │
│ 3  │ 王五     │ 22   │ 广州 │ 95.3           │
│ ...│ ...      │ ...  │ ...  │ ...            │
├────┴──────────┴──────┴──────┴────────────────┤
│ [Sheet1] [Sheet2] [Sheet3]                    │
└──────────────────────────────────────────────┘
```

## 支持的文件格式

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| CSV | `.csv` | 逗号分隔值，自动检测分隔符 |
| TSV | `.tsv` | 制表符分隔值 |
| Excel | `.xlsx` | Office Open XML 电子表格 |
| Excel 97 | `.xls` | 旧版 Excel 格式 |

## 安装

### 从 VS Code 市场安装

在 VS Code 扩展面板搜索 `数据表查看器` 或 `data-viewer`。

### 从 VSIX 安装

```bash
code --install-extension data-viewer-0.1.0.vsix
```

### 从源码构建

```bash
git clone https://github.com/ixxxxoooo/data-viewer.git
cd data-viewer
npm install
npm run build
```

## 使用方式

安装后，直接在 VS Code 中打开 `.csv`、`.tsv`、`.xlsx`、`.xls` 文件即可。扩展会自动接管这些文件类型的打开方式。

如需切换回默认文本编辑器，右键文件标签 → "重新打开编辑器" → 选择 "文本编辑器"。

## 性能

| 数据规模 | CSV 解析 | Excel 解析 |
|----------|----------|-----------|
| 1,000 行 | < 100ms | < 200ms |
| 10,000 行 | < 500ms | < 1s |
| 100,000 行 | < 3s | < 5s |

基于 AG Grid 的虚拟滚动机制，即使数据量很大，滚动和操作也非常流畅。

## 开发

### 前置要求

- Node.js >= 18
- npm >= 9

### 常用命令

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式（开发时使用）
npm run watch

# 运行测试
npm test

# 打包为 .vsix
npm run package
```

### 调试

1. 在 VS Code 中打开项目
2. 按 `F5` 启动扩展调试（会自动构建并启动扩展开发宿主）
3. 在新窗口中打开一个 CSV/Excel 文件

### 项目结构

```
data-viewer/
├── src/
│   ├── extension.ts          # 扩展入口
│   ├── dataViewerProvider.ts  # 自定义编辑器提供者
│   ├── parsers/
│   │   ├── types.ts           # 解析结果类型定义
│   │   ├── csvParser.ts       # CSV/TSV 解析器（PapaParse）
│   │   └── excelParser.ts     # Excel 解析器（SheetJS）
│   └── webview/
│       └── main.ts            # Webview 端 AG Grid 渲染
├── test/
│   ├── suite/                 # 测试用例
│   ├── fixtures/              # 测试数据文件
│   └── helpers/               # 测试辅助工具
├── images/                    # 图标资源
├── dist/                      # 构建输出
└── package.json
```

### 技术栈

- **AG Grid Community** — 高性能虚拟滚动表格
- **PapaParse** — CSV/TSV 解析
- **SheetJS (xlsx)** — Excel 文件解析
- **esbuild** — 快速打包构建
- **Jest + ts-jest** — 单元测试

## 许可证

[MIT](LICENSE) © ixxxxoooo
