# Data Viewer

[English](README.md) | **中文**

<p align="center">
  <img src="images/icon.png" alt="Data Viewer" width="128" height="128">
</p>

<p align="center">
  高性能 CSV/Excel 数据表查看器 VS Code 扩展，支持虚拟滚动、筛选、排序和编辑。
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ixxxxoooo.data-viewer"><img src="https://img.shields.io/visual-studio-marketplace/v/ixxxxoooo.data-viewer?style=flat-square&label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
</p>

---

## 功能特性

- **CSV/TSV 支持** — 自动检测分隔符（逗号、制表符、分号等），支持带引号字段
- **Excel 支持** — 读取 `.xlsx` / `.xls` 文件，支持多 Sheet 切换
- **虚拟滚动** — 基于 AG Grid，轻松处理 10 万行以上数据
- **全列快速搜索** — 一键搜索所有列的内容
- **列筛选** — 每列支持漏斗式筛选器弹窗，支持搜索、全选/反选
- **列排序** — 点击列头排序，支持升序/降序切换
- **双击编辑** — 双击单元格可直接修改数据，支持撤销/重做和保存
- **行号列** — 固定在左侧的行号，方便定位
- **主题适配** — 自动适配 VS Code 浅色/深色/高对比度主题
- **国际化** — 自动检测 VS Code 语言设置，支持中英文界面
- **状态栏** — 显示文件名、行数、筛选后行数、文件大小、解析耗时

## 支持的文件格式

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| CSV | `.csv` | 逗号分隔值，自动检测分隔符 |
| TSV | `.tsv` | 制表符分隔值 |
| Excel | `.xlsx` | Office Open XML 电子表格 |
| Excel 97 | `.xls` | 旧版 Excel 格式 |

## 安装

### 从 VS Code 市场安装

在 VS Code 扩展面板搜索 `Data Viewer`。

### 从 GitHub Releases 安装

1. 前往 [Releases 页面](https://github.com/ixxxxoooo/data-viewer/releases)
2. 下载最新的 `.vsix` 文件
3. 运行安装命令：

```bash
code --install-extension data-viewer-x.x.x.vsix
```

### 在 Cursor 中安装

Cursor 基于 VS Code 构建，`.vsix` 文件同样适用：

1. 前往 [Releases 页面](https://github.com/ixxxxoooo/data-viewer/releases)
2. 下载最新的 `.vsix` 文件
3. 通过 Cursor CLI 安装：

```bash
cursor --install-extension data-viewer-x.x.x.vsix
```

或手动安装：打开扩展面板（⇧⌘X）→ 点击 `...` 菜单 → **从 VSIX 安装...** → 选择下载的文件。

### 从源码构建

```bash
git clone https://github.com/ixxxxoooo/data-viewer.git
cd data-viewer
npm install
npm run build
npm run package
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
npm install        # 安装依赖
npm run build      # 构建
npm run watch      # 监听模式
npm test           # 运行测试
npm run package    # 打包为 .vsix
```

### 调试

1. 在 VS Code 中打开项目
2. 按 `F5` 启动扩展调试
3. 在新窗口中打开一个 CSV/Excel 文件

### 技术栈

- **AG Grid Community** — 高性能虚拟滚动表格
- **PapaParse** — CSV/TSV 解析
- **SheetJS (xlsx)** — Excel 文件解析
- **esbuild** — 快速打包构建
- **Jest + ts-jest** — 单元测试

## 许可证

[MIT](LICENSE) © ixxxxoooo
