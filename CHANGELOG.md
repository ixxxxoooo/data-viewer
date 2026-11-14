# Changelog

This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Paste / undo shortcuts in the search box and column filter popup now work with Caps Lock, Shift and non-Latin keyboard layouts
- Pressing Enter in the global search applies it immediately; in the column filter popup it applies the filter (search results are selected by default, like Excel); IME composition Enter is ignored
- The row number column no longer takes part in global search
- Column names containing `.` no longer render as empty columns
- The status bar no longer shows stale row counts / sheet name after switching sheets
- Cell edits keep leading zeros and long numbers as text; undo / redo restores the exact original value
- CSV is no longer silently altered on save: `007`, `1.50`, long IDs and dates are kept as-is, and only exact `true` / `false` become booleans
- Numeric columns sort by value even when the cells are text such as `1.50` or `10`
- Webview CSP now allows `data:` images / fonts so AG Grid icons are not blocked
- Header text color theme parameter name (`headerTextColor`)

### Changed

- Global search supports `"double quoted phrases"`; unquoted words are still matched independently (all must match)
- Faster filter popup for columns with many unique values (reused `Intl.Collator`, precomputed lowercase text)
- Search debounce adapts to row count

## [0.1.0] - 2026-09-02

### Added

- High-performance CSV/TSV viewer with auto delimiter detection (PapaParse)
- Excel (`.xlsx` / `.xls`) viewer with multi-sheet tab switching (SheetJS)
- Virtual scrolling powered by AG Grid for 100,000+ rows
- Quick search across all columns
- Per-column funnel filter popup with search, select all, apply/cancel/clear
- Column sorting by clicking headers (ascending / descending toggle)
- Double-click cell editing with undo/redo and save support
- Pinned row number column
- Auto theme adaptation (light / dark / high-contrast)
- i18n support (English default, Chinese auto-detected)
- Status bar with file name, row count, file size and parse time
- CSP security policy for webview
