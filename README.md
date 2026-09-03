# Excel & CSV Data Viewer

**English** | [中文](README.zh-CN.md)

<p align="center">
  <img src="images/icon.png" alt="Excel & CSV Data Viewer" width="128" height="128">
</p>

<p align="center">
  A high-performance Excel & CSV data viewer for VS Code with virtual scrolling, filtering, sorting and editing.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ixxxxoooo.excel-csv-data-viewer"><img src="https://img.shields.io/visual-studio-marketplace/v/ixxxxoooo.excel-csv-data-viewer?style=flat-square&label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
</p>

---

## Features

- **CSV/TSV Support** — Auto-detects delimiters (comma, tab, semicolon, etc.) with quoted field support
- **Excel Support** — Opens `.xlsx` / `.xls` files with multi-sheet tab switching
- **Virtual Scrolling** — Powered by AG Grid, handles 100,000+ rows with ease
- **Quick Search** — Search across all columns instantly
- **Column Filtering** — Funnel-style filter popup per column with search, select all / deselect
- **Column Sorting** — Click column headers to sort ascending / descending
- **Double-click Editing** — Edit cell data in-place with full undo/redo and save support
- **Row Numbers** — Pinned row number column for easy reference
- **Theme Aware** — Automatically adapts to VS Code light / dark / high-contrast themes
- **i18n** — Auto-detects VS Code language; supports English and Chinese
- **Status Bar** — Shows file name, row count, filtered count, file size and parse time

## Supported Formats

| Format | Extensions | Notes |
|--------|-----------|-------|
| CSV | `.csv` | Auto-detects delimiter |
| TSV | `.tsv` | Tab-separated values |
| Excel | `.xlsx` | Office Open XML |
| Excel 97 | `.xls` | Legacy Excel format |

## Installation

### From VS Code Marketplace

Search for `Data Viewer` in the Extensions panel.

### From GitHub Releases

1. Go to the [Releases page](https://github.com/ixxxxoooo/data-viewer/releases)
2. Download the latest `.vsix` file
3. Install it:

```bash
code --install-extension data-viewer-x.x.x.vsix
```

### In Cursor

Cursor is built on VS Code, so the `.vsix` works there too:

1. Go to the [Releases page](https://github.com/ixxxxoooo/data-viewer/releases)
2. Download the latest `.vsix` file
3. Install it via the Cursor CLI:

```bash
cursor --install-extension data-viewer-x.x.x.vsix
```

Or install manually: open the Extensions panel (⇧⌘X) → click the `...` menu → **Install from VSIX...** → select the downloaded file.

### Build from Source

```bash
git clone https://github.com/ixxxxoooo/data-viewer.git
cd data-viewer
npm install
npm run build
npm run package
```

## Usage

After installation, simply open any `.csv`, `.tsv`, `.xlsx`, or `.xls` file in VS Code. The extension automatically registers as the default editor for these file types.

To switch back to the default text editor, right-click the file tab → "Reopen Editor With..." → select "Text Editor".

## Performance

| Scale | CSV Parse | Excel Parse |
|-------|-----------|-------------|
| 1,000 rows | < 100ms | < 200ms |
| 10,000 rows | < 500ms | < 1s |
| 100,000 rows | < 3s | < 5s |

Virtual scrolling ensures smooth interaction even with very large datasets.

## Development

### Prerequisites

- Node.js >= 18
- npm >= 9

### Commands

```bash
npm install        # Install dependencies
npm run build      # Build extension
npm run watch      # Watch mode for development
npm test           # Run tests
npm run package    # Package as .vsix
```

### Debugging

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. Open a CSV or Excel file in the new window

### Project Structure

```
data-viewer/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── dataViewerProvider.ts  # Custom editor provider
│   ├── parsers/
│   │   ├── types.ts           # Data types
│   │   ├── csvParser.ts       # CSV/TSV parser (PapaParse)
│   │   └── excelParser.ts     # Excel parser (SheetJS)
│   └── webview/
│       └── main.ts            # Webview UI with AG Grid
├── test/                      # Test suites and fixtures
├── images/                    # Extension icon
├── dist/                      # Build output
└── package.json
```

### Tech Stack

- **AG Grid Community** — High-performance virtual scrolling grid
- **PapaParse** — CSV/TSV parsing
- **SheetJS (xlsx)** — Excel file parsing
- **esbuild** — Fast bundler
- **Jest + ts-jest** — Unit testing

## Publishing

### To VS Code Marketplace

```bash
# 1. Install vsce
npm install -g @vscode/vsce

# 2. Login with your publisher account
vsce login <publisher-name>

# 3. Package and publish
vsce publish
```

### To GitHub Releases

```bash
# 1. Build the .vsix
npm run package

# 2. Create a release on GitHub
gh release create v0.1.0 data-viewer-0.1.0.vsix --title "v0.1.0" --notes "Initial release"
```

Others can then install directly:

```bash
# Download and install from GitHub
gh release download v0.1.0 -p "*.vsix" -R ixxxxoooo/data-viewer
code --install-extension data-viewer-0.1.0.vsix

# Or in Cursor
cursor --install-extension data-viewer-0.1.0.vsix
```

## License

[MIT](LICENSE) © ixxxxoooo
