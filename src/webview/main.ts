import {
  createGrid,
  GridApi,
  GridOptions,
  ColDef,
  ModuleRegistry,
  ClientSideRowModelModule,
  CommunityFeaturesModule,
  themeQuartz,
  type Theme,
} from 'ag-grid-community';

ModuleRegistry.registerModules([ClientSideRowModelModule, CommunityFeaturesModule]);

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void; getState(): unknown; setState(state: unknown): void };
const vscode = acquireVsCodeApi();

interface SheetData { name: string; headers: string[]; rows: Record<string, unknown>[] }
interface DataPayload { fileName: string; sheets: SheetData[]; parseTimeMs: number; fileSizeBytes: number; lang?: string }

// ===================== i18n =====================

const I18N: Record<string, Record<string, string>> = {
  en: {
    search: 'Search all columns...',
    searchFilter: 'Search...',
    selectAll: 'Select All',
    apply: 'Apply',
    cancel: 'Cancel',
    clear: 'Clear',
    filter: 'Filter',
    empty: '(empty)',
    showingN: 'Showing first {limit} of {total}',
    totalRows: '{n} rows',
    filteredRows: '{n} after filter',
    loading: 'Loading...',
    parseFailed: 'Failed to parse file',
    editCell: 'Edit Cell',
  },
  zh: {
    search: '搜索全部列...',
    searchFilter: '搜索...',
    selectAll: '全选',
    apply: '应用',
    cancel: '取消',
    clear: '清除',
    filter: '筛选',
    empty: '(空)',
    showingN: '显示前 {limit} 个（共 {total} 个）',
    totalRows: '共 {n} 行',
    filteredRows: '筛选后 {n} 行',
    loading: '正在加载...',
    parseFailed: '文件解析失败',
    editCell: '编辑单元格',
  },
};

let currentLang = 'en';

function t(key: string, vars?: Record<string, string | number>): string {
  let s = I18N[currentLang]?.[key] ?? I18N.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

function detectLang(): string {
  const html = document.documentElement.lang?.toLowerCase() || '';
  if (html.startsWith('zh')) return 'zh';
  return 'en';
}

let gridApi: GridApi | null = null;
let allSheets: SheetData[] = [];
let currentSheetIndex = 0;
let dataPayloadCache: DataPayload | null = null;
let _suppressEdit = false;

// ===================== External Filter =====================

const columnFilters = new Map<string, Set<string>>();

function isExternalFilterPresent(): boolean {
  return columnFilters.size > 0;
}

function doesExternalFilterPass(node: any): boolean {
  for (const [field, allowed] of columnFilters) {
    const v = node.data[field];
    if (!allowed.has(v == null ? '' : String(v))) return false;
  }
  return true;
}

// ===================== Filter Popup =====================

let activePopup: { overlay: HTMLDivElement; popup: HTMLDivElement; field: string } | null = null;

function closeFilterPopup(): void {
  if (!activePopup) return;
  activePopup.overlay.remove();
  activePopup.popup.remove();
  activePopup = null;
}

function openFilterPopup(field: string, anchor: HTMLElement): void {
  closeFilterPopup();
  if (!gridApi) return;

  const valCounts = new Map<string, number>();
  let totalCount = 0;
  gridApi.forEachNode((node: any) => {
    if (!node.data) return;
    const raw = node.data[field];
    const v = raw == null ? '' : String(raw);
    valCounts.set(v, (valCounts.get(v) || 0) + 1);
    totalCount++;
  });
  const sorted = [...valCounts.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const current = columnFilters.get(field);
  const staged = current ? new Set(current) : new Set(sorted);

  const overlay = document.createElement('div');
  overlay.className = 'dv-fp-overlay';
  overlay.addEventListener('mousedown', () => closeFilterPopup());

  const popup = document.createElement('div');
  popup.className = 'dv-fp';
  popup.addEventListener('mousedown', (e) => e.stopPropagation());

  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = t('searchFilter');
  search.className = 'dv-fp-search';
  popup.appendChild(search);

  const allRow = document.createElement('div');
  allRow.className = 'dv-fp-row';
  const allCb = document.createElement('input');
  allCb.type = 'checkbox';
  allCb.checked = staged.size === sorted.length;
  allCb.className = 'dv-fp-cb';
  const allLbl = document.createElement('span');
  allLbl.className = 'dv-fp-lbl';
  allLbl.textContent = t('selectAll');
  const allCnt = document.createElement('span');
  allCnt.className = 'dv-fp-count';
  allCnt.textContent = totalCount.toLocaleString();
  allRow.appendChild(allCb);
  allRow.appendChild(allLbl);
  allRow.appendChild(allCnt);
  popup.appendChild(allRow);

  const list = document.createElement('div');
  list.className = 'dv-fp-list';
  popup.appendChild(list);

  const cbMap = new Map<string, HTMLInputElement>();

  function renderList(vals: string[]) {
    list.innerHTML = '';
    cbMap.clear();
    const limit = 500;
    const display = vals.slice(0, limit);
    for (const v of display) {
      const row = document.createElement('div');
      row.className = 'dv-fp-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = staged.has(v);
      cb.className = 'dv-fp-cb';
      cb.addEventListener('change', () => {
        if (cb.checked) staged.add(v); else staged.delete(v);
        syncAll();
      });
      row.addEventListener('click', (e) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        if (cb.checked) staged.add(v); else staged.delete(v);
        syncAll();
      });
      const lbl = document.createElement('span');
      lbl.className = 'dv-fp-lbl';
      lbl.textContent = v || t('empty');
      if (!v) lbl.style.opacity = '0.5';

      const cnt = document.createElement('span');
      cnt.className = 'dv-fp-count';
      cnt.textContent = (valCounts.get(v) || 0).toLocaleString();

      row.appendChild(cb);
      row.appendChild(lbl);
      row.appendChild(cnt);
      list.appendChild(row);
      cbMap.set(v, cb);
    }
    if (vals.length > limit) {
      const n = document.createElement('div');
      n.className = 'dv-fp-note';
      n.textContent = t('showingN', { limit, total: vals.length });
      list.appendChild(n);
    }
  }

  function syncAll() {
    const vis = [...cbMap.keys()];
    const allOn = vis.length > 0 && vis.every(v => staged.has(v));
    const noneOn = vis.every(v => !staged.has(v));
    allCb.checked = allOn;
    allCb.indeterminate = !allOn && !noneOn;
  }

  allCb.addEventListener('change', () => {
    if (allCb.checked) {
      for (const v of sorted) staged.add(v);
    } else {
      staged.clear();
    }
    for (const [, cb] of cbMap) cb.checked = allCb.checked;
  });
  allRow.addEventListener('click', (e) => {
    if (e.target === allCb) return;
    allCb.checked = !allCb.checked;
    allCb.dispatchEvent(new Event('change'));
  });

  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    renderList(q ? sorted.filter(v => v.toLowerCase().includes(q)) : sorted);
    syncAll();
  });
  search.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key)) {
      e.stopPropagation();
    }
  });

  renderList(sorted);

  const btnRow = document.createElement('div');
  btnRow.className = 'dv-fp-btns';
  btnRow.appendChild(makeBtn(t('apply'), true, () => {
    if (staged.size === sorted.length) columnFilters.delete(field);
    else columnFilters.set(field, new Set(staged));
    gridApi?.onFilterChanged();
    closeFilterPopup();
    updateFilterIcons();
    updateStatus(allSheets[currentSheetIndex]);
  }));
  btnRow.appendChild(makeBtn(t('cancel'), false, () => closeFilterPopup()));
  btnRow.appendChild(makeBtn(t('clear'), false, () => {
    columnFilters.delete(field);
    gridApi?.onFilterChanged();
    closeFilterPopup();
    updateFilterIcons();
    updateStatus(allSheets[currentSheetIndex]);
  }));
  popup.appendChild(btnRow);

  document.body.appendChild(overlay);
  document.body.appendChild(popup);

  const rect = anchor.getBoundingClientRect();
  const popupH = 380;
  const top = rect.bottom + 2;
  const left = Math.min(rect.left, window.innerWidth - 260);
  popup.style.top = (top + popupH > window.innerHeight ? Math.max(4, rect.top - popupH - 2) : top) + 'px';
  popup.style.left = Math.max(4, left) + 'px';

  activePopup = { overlay, popup, field };
  requestAnimationFrame(() => search.focus());
}

function makeBtn(text: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.className = primary ? 'dv-fp-btn dv-fp-btn-p' : 'dv-fp-btn';
  b.addEventListener('click', onClick);
  return b;
}

// ===================== Cell & Header Crosshair State =====================

let activeRowIndex: number | null = null;
let activeColId: string | null = null;

function updateRowHighlight(): void {
  if (!gridApi) return;
  gridApi.refreshCells({ columns: ['__dv_row_num'], force: true });
}

function updateHeaderHighlight(prevColId: string | null, newColId: string | null): void {
  const gridRoot = document.getElementById('dv-grid');
  if (!gridRoot) return;
  if (prevColId) {
    const prevHeaders = gridRoot.querySelectorAll(`.ag-header-cell[col-id="${prevColId}"]`);
    prevHeaders.forEach((el) => el.classList.remove('dv-header-active'));
  }
  if (newColId && newColId !== '__dv_row_num') {
    const newHeaders = gridRoot.querySelectorAll(`.ag-header-cell[col-id="${newColId}"]`);
    newHeaders.forEach((el) => el.classList.add('dv-header-active'));
  }
}

// ===================== Custom Header Component =====================

class FilterHeader {
  private eGui!: HTMLDivElement;
  private params!: any;
  private sortEl!: HTMLSpanElement;
  private filterEl!: HTMLSpanElement;

  init(params: any): void {
    this.params = params;
    this.eGui = document.createElement('div');
    this.eGui.className = 'dv-ch';

    const label = document.createElement('span');
    label.className = 'dv-ch-text';
    label.textContent = params.displayName;

    this.sortEl = document.createElement('span');
    this.sortEl.className = 'dv-ch-sort';

    this.filterEl = document.createElement('span');
    this.filterEl.className = 'dv-ch-filter';
    this.filterEl.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10"><path d="M1 1h10L7.5 5.5V9.5L4.5 11V5.5z" fill="currentColor"/></svg>';
    this.filterEl.title = t('filter');

    this.eGui.appendChild(label);
    this.eGui.appendChild(this.sortEl);
    this.eGui.appendChild(this.filterEl);

    label.addEventListener('click', (e) => params.progressSort(e.shiftKey));
    this.filterEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openFilterPopup(params.column.getColId(), this.filterEl);
    });

    if (params.column) {
      params.column.addEventListener('sortChanged', () => this.refreshSort());
    }
    this.refreshSort();
    this.refreshFilter();
    this.syncActive();
  }

  syncActive(): void {
    const colId = this.params.column?.getColId?.();
    const isActive = colId && colId === activeColId;
    const parentHeader = this.eGui.closest('.ag-header-cell');
    if (parentHeader) {
      parentHeader.classList.toggle('dv-header-active', !!isActive);
    }
  }

  refreshSort(): void {
    const s = this.params.column?.getSort?.();
    this.sortEl.textContent = s === 'asc' ? ' ↑' : s === 'desc' ? ' ↓' : '';
  }

  refreshFilter(): void {
    const active = columnFilters.has(this.params.column?.getColId?.());
    this.filterEl.classList.toggle('active', active);
  }

  getGui(): HTMLElement { return this.eGui; }
  refresh(): boolean {
    this.refreshSort();
    this.refreshFilter();
    this.syncActive();
    return true;
  }
  destroy(): void {}
}

function updateFilterIcons(): void {
  if (!gridApi) return;
  gridApi.refreshHeader();
}

// ===================== Utilities =====================

function isDark(): boolean {
  return document.body.classList.contains('vscode-dark') ||
         document.body.classList.contains('vscode-high-contrast') ||
         (!document.body.classList.contains('vscode-light') && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

// ===================== Theme =====================

function buildTheme(): Theme {
  const d = isDark();
  return themeQuartz.withParams(d ? {
    backgroundColor: '#181818', foregroundColor: '#cccccc',
    headerBackgroundColor: '#222222', headerForegroundColor: '#f0f0f0',
    borderColor: '#2e2e2e', rowHoverColor: '#262b32',
    selectedRowBackgroundColor: 'transparent', oddRowBackgroundColor: '#202020',
    headerFontSize: 12, fontSize: 12, spacing: 2.5, wrapperBorderRadius: 0,
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    headerColumnResizeHandleHeight: '0%', cellHorizontalPaddingScale: 0.6,
  } : {
    backgroundColor: '#ffffff', foregroundColor: '#333333',
    headerBackgroundColor: '#f2f3f5', headerForegroundColor: '#222222',
    borderColor: '#dcdfe6', rowHoverColor: '#edf2f7',
    selectedRowBackgroundColor: 'transparent', oddRowBackgroundColor: '#f7f8fa',
    headerFontSize: 12, fontSize: 12, spacing: 2.5, wrapperBorderRadius: 0,
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    headerColumnResizeHandleHeight: '0%', cellHorizontalPaddingScale: 0.6,
  });
}

// ===================== Column Width Estimation =====================

function estimateColumnWidth(header: string, rows: Record<string, unknown>[]): number {
  const measureStr = (s: string): number => {
    let w = 0;
    for (let i = 0; i < s.length; i++) {
      w += s.charCodeAt(i) > 255 ? 13 : 7.5;
    }
    return w;
  };

  let maxWidth = measureStr(header);
  const sampleSize = Math.min(rows.length, 100);
  for (let i = 0; i < sampleSize; i++) {
    const val = rows[i]?.[header];
    if (val != null) {
      const str = String(val);
      const w = measureStr(str);
      if (w > maxWidth) maxWidth = w;
      if (maxWidth > 360) break;
    }
  }

  // 排序箭头与筛选图标宽度(约28px) + 单元格左右padding(16px) = 44px
  const estimated = Math.ceil(maxWidth + 44);
  return Math.min(Math.max(estimated, 80), 360);
}

// ===================== Load Sheet =====================

function loadSheet(index: number): void {
  const sheet = allSheets[index];
  if (!sheet) return;

  columnFilters.clear();
  activeRowIndex = null;
  activeColId = null;
  sheet.rows.forEach((r, i) => { (r as any).__dvIdx = i; });

  const rowNumCol: ColDef = {
    colId: '__dv_row_num',
    headerName: '',
    valueGetter: (p) => p.node ? p.node.rowIndex! + 1 : '',
    width: 52, minWidth: 40, maxWidth: 72,
    pinned: 'left', sortable: false, resizable: false, editable: false,
    suppressMovable: true, suppressHeaderMenuButton: true,
    cellClass: (p) => {
      const isActive = p.node && p.node.rowIndex === activeRowIndex;
      return isActive ? 'dv-row-num-cell dv-row-num-active' : 'dv-row-num-cell';
    },
  };

  // 检测列是否为纯数值列，是则居右对齐
  const isColNumeric = (field: string) => {
    let numCount = 0;
    let totalCount = 0;
    const sample = sheet.rows.slice(0, 100);
    for (const r of sample) {
      const val = r[field];
      if (val != null && val !== '') {
        totalCount++;
        if (typeof val === 'number' || (!isNaN(Number(val)) && typeof val !== 'boolean')) {
          numCount++;
        }
      }
    }
    return totalCount > 0 && (numCount / totalCount) >= 0.8;
  };

  const dataCols: ColDef[] = sheet.headers.map((h) => {
    const isNum = isColNumeric(h);
    const colWidth = estimateColumnWidth(h, sheet.rows);
    return {
      field: h, headerName: h,
      headerComponent: FilterHeader,
      sortable: true, resizable: true, editable: true,
      width: colWidth,
      minWidth: 60,
      cellDataType: false,
      suppressHeaderMenuButton: true,
      cellStyle: isNum ? { textAlign: 'right' } : undefined,
      valueSetter: (params: any) => {
        const raw = params.newValue;
        if (raw === params.oldValue) return false;
        const num = Number(raw);
        params.data[params.colDef.field!] = (raw !== '' && raw != null && !isNaN(num)) ? num : raw;
        return true;
      },
    };
  });

  const container = document.getElementById('dv-grid')!;
  if (gridApi) {
    gridApi.setGridOption('columnDefs', [rowNumCol, ...dataCols]);
    gridApi.setGridOption('rowData', sheet.rows);
    gridApi.onFilterChanged();
    updateStatus(sheet);
    return;
  }
  container.innerHTML = '';

  const opts: GridOptions = {
    theme: buildTheme(),
    columnDefs: [rowNumCol, ...dataCols],
    rowData: sheet.rows,
    getRowId: (p) => String(p.data.__dvIdx),
    defaultColDef: { minWidth: 60, sortable: true, resizable: true },
    isExternalFilterPresent,
    doesExternalFilterPass,
    animateRows: false,
    rowBuffer: 30,
    suppressColumnVirtualisation: false,
    enableCellTextSelection: true,
    ensureDomOrder: true,
    stopEditingWhenCellsLoseFocus: true,
    singleClickEdit: false,
    onCellFocused: (e) => {
      const newRow = e.rowIndex;
      const newCol = e.column ? e.column.getColId() : null;
      if (newRow === activeRowIndex && newCol === activeColId) return;
      const prevCol = activeColId;
      activeRowIndex = newRow;
      activeColId = newCol;
      updateRowHighlight();
      updateHeaderHighlight(prevCol, activeColId);
    },
    onCellValueChanged: (e) => {
      if (_suppressEdit || !e.colDef.field) return;
      vscode.postMessage({
        type: 'edit',
        payload: {
          sheetIndex: currentSheetIndex,
          rowIndex: e.data.__dvIdx as number,
          field: e.colDef.field,
          oldValue: e.oldValue,
          newValue: e.newValue,
        },
      });
    },
    onFilterChanged: () => updateStatus(sheet),
    onRowDataUpdated: () => updateStatus(sheet),
  };

  gridApi = createGrid(container, opts);
  updateStatus(sheet);
}

// ===================== Status Bar =====================

function updateStatus(sheet: SheetData): void {
  const el = document.getElementById('dv-status');
  if (!el || !gridApi) return;
  const displayed = gridApi.getDisplayedRowCount();
  const total = sheet.rows.length;
  const p: string[] = [];
  if (dataPayloadCache) p.push(dataPayloadCache.fileName);
  if (allSheets.length > 1) p.push(`[${sheet.name}]`);
  p.push(t('totalRows', { n: total.toLocaleString() }));
  if (displayed !== total) p.push(t('filteredRows', { n: displayed.toLocaleString() }));
  if (dataPayloadCache) {
    p.push(fmtSize(dataPayloadCache.fileSizeBytes));
    p.push(`${dataPayloadCache.parseTimeMs}ms`);
  }
  el.textContent = p.join('  ·  ');
}

// ===================== Sheet Tabs =====================

function renderSheetTabs(): void {
  const bar = document.getElementById('dv-sheet-bar')!;
  bar.innerHTML = '';
  if (allSheets.length <= 1) return;
  allSheets.forEach((s, i) => {
    const t = document.createElement('button');
    t.className = 'dv-sheet-tab' + (i === currentSheetIndex ? ' active' : '');
    t.textContent = s.name;
    t.addEventListener('click', () => {
      if (i === currentSheetIndex) return;
      currentSheetIndex = i;
      closeFilterPopup();
      loadSheet(i);
      renderSheetTabs();
    });
    bar.appendChild(t);
  });
}

// ===================== Build UI =====================

let appBuilt = false;
let searchTimer: number;

function buildApp(): void {
  if (appBuilt) return;
  appBuilt = true;

  const app = document.getElementById('app')!;
  app.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'dv-toolbar';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'dv-search-wrap';

  const searchBox = document.createElement('input');
  searchBox.type = 'text';
  searchBox.className = 'dv-search';
  searchBox.placeholder = t('search');

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'dv-search-clear';
  clearBtn.setAttribute('aria-label', t('clear'));
  clearBtn.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  clearBtn.style.display = 'none';

  const syncClearBtn = () => {
    clearBtn.style.display = searchBox.value ? 'flex' : 'none';
  };

  searchBox.addEventListener('input', () => {
    syncClearBtn();
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      gridApi?.setGridOption('quickFilterText', searchBox.value);
    }, 120);
  });
  // 确保搜索框内标准编辑快捷键正常工作
  searchBox.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key)) {
      e.stopPropagation();
    }
    if (e.key === 'Escape' && searchBox.value) {
      e.stopPropagation();
      searchBox.value = '';
      syncClearBtn();
      gridApi?.setGridOption('quickFilterText', '');
    }
  });

  clearBtn.addEventListener('click', () => {
    searchBox.value = '';
    syncClearBtn();
    gridApi?.setGridOption('quickFilterText', '');
    searchBox.focus();
  });

  searchWrap.appendChild(searchBox);
  searchWrap.appendChild(clearBtn);
  toolbar.appendChild(searchWrap);

  const status = document.createElement('span');
  status.className = 'dv-status';
  status.id = 'dv-status';
  toolbar.appendChild(status);

  app.appendChild(toolbar);

  const grid = document.createElement('div');
  grid.id = 'dv-grid';
  app.appendChild(grid);

  const bar = document.createElement('div');
  bar.className = 'dv-sheet-bar';
  bar.id = 'dv-sheet-bar';
  app.appendChild(bar);
}

// ===================== Styles =====================

function injectStyles(): void {
  const s = document.createElement('style');
  s.textContent = `
*,*::before,*::after{box-sizing:border-box}
:root {
  --dv-header-bg: #222222;
  --dv-header-fg: #d0d0d0;
  --dv-border-color: #2e2e2e;
  --dv-cell-bg: #181818;
  --dv-cell-fg: #cccccc;
  --dv-focus-color: #0078d4;
  --dv-header-active-bg: rgba(0, 120, 212, 0.16);
}
body.vscode-light, body:not(.vscode-dark):not(.vscode-high-contrast) {
  --dv-header-bg: #f2f3f5;
  --dv-header-fg: #333333;
  --dv-border-color: #dcdfe6;
  --dv-cell-bg: #ffffff;
  --dv-cell-fg: #333333;
  --dv-focus-color: #0078d4;
  --dv-header-active-bg: rgba(0, 120, 212, 0.1);
}
body.vscode-dark {
  --dv-header-bg: #222222;
  --dv-header-fg: #d0d0d0;
  --dv-border-color: #2e2e2e;
  --dv-cell-bg: #181818;
  --dv-cell-fg: #cccccc;
  --dv-focus-color: #0078d4;
  --dv-header-active-bg: rgba(0, 120, 212, 0.16);
}
body.vscode-high-contrast {
  --dv-header-bg: #000000;
  --dv-header-fg: #ffffff;
  --dv-border-color: #6fc3df;
  --dv-cell-bg: #000000;
  --dv-cell-fg: #ffffff;
  --dv-focus-color: #6fc3df;
  --dv-header-active-bg: #004b87;
}

body{margin:0;overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  font-size:12px;
  background:var(--vscode-editor-background,#fff);
  color:var(--vscode-editor-foreground,#333)}
#app{display:flex;flex-direction:column;height:100vh;overflow:hidden}

/* loading */
.dv-loading{display:flex;align-items:center;justify-content:center;height:100vh;
  color:var(--vscode-descriptionForeground,#888);font-size:13px;gap:8px}
.dv-spinner{width:18px;height:18px;border:2px solid var(--vscode-descriptionForeground,#888);
  border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* toolbar */
.dv-toolbar{display:flex;align-items:center;gap:10px;padding:4px 8px;
  background:var(--vscode-editorWidget-background,#f3f3f3);
  border-bottom:1px solid var(--dv-border-color,#2e2e2e);flex-shrink:0}
.dv-search-wrap{position:relative;display:inline-flex;align-items:center;width:220px}
.dv-search{padding:3px 24px 3px 8px;width:100%;
  border:1px solid var(--vscode-input-border,#cecece);border-radius:3px;
  background:var(--vscode-input-background,#fff);
  color:var(--vscode-input-foreground,#333);font-size:12px;outline:none;box-sizing:border-box}
.dv-search:focus{border-color:var(--vscode-focusBorder,#0078d4)}
.dv-search::placeholder{color:var(--vscode-input-placeholderForeground,#999)}
.dv-search-clear{position:absolute;right:4px;display:flex;align-items:center;
  justify-content:center;width:16px;height:16px;padding:0;border:none;
  background:transparent;cursor:pointer;border-radius:50%;
  color:var(--vscode-input-placeholderForeground,#999);opacity:.7;line-height:1}
.dv-search-clear:hover{opacity:1;background:var(--vscode-list-hoverBackground,rgba(0,0,0,.08))}
.dv-search-clear:focus-visible{outline:1px solid var(--vscode-focusBorder,#0078d4)}
.dv-status{font-size:11px;margin-left:auto;white-space:nowrap;
  color:var(--vscode-descriptionForeground,#888)}

/* grid wrapper */
#dv-grid{flex:1;overflow:hidden}
.ag-root-wrapper{border:none !important}

/* 单元格与表头细边框 —— 线条分明且保证AG Grid绝对定位正常 */
.ag-cell{border-right:1px solid var(--dv-border-color) !important;
  border-bottom:1px solid var(--dv-border-color) !important;
  font-size:12px}
.ag-header-cell{background-color:var(--dv-header-bg) !important;
  border-right:1px solid var(--dv-border-color) !important;
  border-bottom:1px solid var(--dv-border-color) !important}
.ag-header{background-color:var(--dv-header-bg) !important;
  border-bottom:1px solid var(--dv-border-color) !important}
.ag-pinned-left-header{background-color:var(--dv-header-bg) !important}

/* 第一列行号单元格（与第一行表头颜色一致） */
.dv-row-num-cell{
  background-color:var(--dv-header-bg) !important;
  color:var(--dv-header-fg) !important;
  font-weight:600 !important;
  font-size:12px !important;
  user-select:none;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  padding:0 !important;
  transition:background-color .1s, color .1s}

/* 选中的行序号高亮（位置指示亮一下） */
body.vscode-dark .dv-row-num-active{
  background-color:#2a394a !important;
  color:#ffffff !important;
  box-shadow:inset 3px 0 0 var(--dv-focus-color,#0078d4) !important}
body:not(.vscode-dark) .dv-row-num-active{
  background-color:#dbeafe !important;
  color:#1e40af !important;
  box-shadow:inset 3px 0 0 var(--dv-focus-color,#0078d4) !important}

/* 选中的列头高亮与底边亮蓝指示条（位置指示亮一下） */
.ag-header-cell.dv-header-active{
  background-color:var(--dv-header-active-bg) !important}
.ag-header-cell.dv-header-active::after{
  content:'';
  position:absolute;
  bottom:0;
  left:0;
  right:0;
  height:2.5px;
  background-color:var(--dv-focus-color,#0078d4);
  z-index:10;
  pointer-events:none}
.ag-header-cell.dv-header-active .dv-ch-text{
  color:var(--dv-focus-color,#40a9ff);
  font-weight:700}

/* 斑马纹奇偶行交替与悬停 */
body.vscode-dark .ag-row-odd{background-color:#202020 !important}
body.vscode-dark .ag-row-even{background-color:#181818 !important}
body:not(.vscode-dark) .ag-row-odd{background-color:#f7f8fa !important}
body:not(.vscode-dark) .ag-row-even{background-color:#ffffff !important}
body.vscode-dark .ag-row:hover{background-color:#262b32 !important}
body:not(.vscode-dark) .ag-row:hover{background-color:#edf2f7 !important}

/* 选中单元格高亮（取消整行高亮，仅选中单元格亮） */
.ag-row-selected{
  background-color:transparent !important}
body.vscode-dark .ag-cell-focus:not(.dv-row-num-cell){
  background-color:#004b87 !important;
  color:#ffffff !important;
  font-weight:600;
  outline:1px solid #1084d8 !important;
  outline-offset:-1px}
body:not(.vscode-dark) .ag-cell-focus:not(.dv-row-num-cell){
  background-color:#bae0fd !important;
  color:#0c3b60 !important;
  font-weight:600;
  outline:1px solid #0078d4 !important;
  outline-offset:-1px}
.ag-cell-focus.dv-row-num-cell{
  outline:none !important}

/* custom header wrapper & content */
.ag-header-cell-comp-wrapper{height:100%;width:100%;display:flex;align-items:center}
.dv-ch{display:flex;align-items:center;width:100%;height:100%;gap:2px;
  user-select:none;padding:0 4px}
.dv-ch-text{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  cursor:pointer;font-weight:600;font-size:12px}
.dv-ch-sort{font-size:11px;opacity:.6;flex-shrink:0}
.dv-ch-filter{cursor:pointer;font-size:9px;padding:2px 4px;border-radius:3px;
  opacity:.4;flex-shrink:0;transition:all .15s}
.dv-ch-filter:hover{opacity:.9;background:var(--vscode-list-hoverBackground,rgba(0,0,0,.06))}
.dv-ch-filter.active{opacity:1;color:var(--vscode-focusBorder,#0078d4)}

/* Sheet 标签 */
.dv-sheet-bar{display:flex;align-items:stretch;
  background:var(--vscode-editorWidget-background,#f3f3f3);
  border-top:1px solid var(--dv-border-color,#2e2e2e);
  flex-shrink:0;overflow-x:auto;min-height:0}
.dv-sheet-bar:empty{display:none}
.dv-sheet-tab{padding:5px 18px;cursor:pointer;font-size:11px;
  border:none;background:transparent;
  color:var(--vscode-descriptionForeground,#666);
  border-top:2px solid transparent;
  border-right:1px solid var(--dv-border-color,#2e2e2e);
  white-space:nowrap;transition:background .1s}
.dv-sheet-tab:hover{background:var(--vscode-list-hoverBackground,rgba(0,0,0,.04))}
.dv-sheet-tab.active{background:var(--vscode-editor-background,#fff);
  color:var(--vscode-editor-foreground,#333);font-weight:600;
  border-top-color:var(--vscode-focusBorder,#0078d4)}

/* ===== filter popup ===== */
.dv-fp-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:999}
.dv-fp{position:fixed;z-index:1000;width:260px;max-height:380px;
  background:var(--vscode-editorWidget-background,#fff);
  border:1px solid var(--vscode-editorWidget-border,#d4d4d4);
  border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.18);
  display:flex;flex-direction:column;padding:8px;font-size:12px;
  overflow:hidden}
.dv-fp-search{width:100%;padding:5px 8px;margin-bottom:6px;
  border:1px solid var(--vscode-input-border,#cecece);border-radius:3px;
  background:var(--vscode-input-background,#fff);
  color:var(--vscode-input-foreground,#333);font-size:12px;outline:none}
.dv-fp-search:focus{border-color:var(--vscode-focusBorder,#0078d4)}
.dv-fp-search::placeholder{color:var(--vscode-input-placeholderForeground,#999)}
.dv-fp-row{display:flex;align-items:center;gap:6px;padding:3px 4px;
  border-radius:3px;cursor:pointer}
.dv-fp-row:hover{background:var(--vscode-list-hoverBackground,rgba(0,0,0,.06))}
.dv-fp-cb{width:15px;height:15px;flex-shrink:0;cursor:pointer;
  accent-color:var(--vscode-focusBorder,#0078d4)}
.dv-fp-lbl{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none}
.dv-fp-count{font-size:11px;opacity:.55;margin-left:auto;padding-left:8px;user-select:none;flex-shrink:0;font-variant-numeric:tabular-nums}
.dv-fp-list{flex:1;overflow-y:auto;min-height:60px;max-height:200px;
  border:1px solid var(--vscode-editorWidget-border,#e0e0e0);
  border-radius:3px;padding:2px;margin-bottom:8px}
.dv-fp-note{padding:4px;font-size:11px;text-align:center;
  color:var(--vscode-descriptionForeground,#999)}
.dv-fp-btns{display:flex;gap:6px}
.dv-fp-btn{flex:1;padding:5px 8px;border:none;border-radius:3px;
  font-size:11px;cursor:pointer;
  background:var(--vscode-button-secondaryBackground,#e0e0e0);
  color:var(--vscode-button-secondaryForeground,#333)}
.dv-fp-btn:hover{opacity:.85}
.dv-fp-btn-p{background:var(--vscode-button-background,#0078d4);
  color:var(--vscode-button-foreground,#fff)}
`;
  document.head.appendChild(s);
}

// ===================== Data Handling =====================

function handleData(payload: DataPayload): void {
  if (payload.lang) currentLang = payload.lang;
  dataPayloadCache = payload;
  allSheets = payload.sheets;
  currentSheetIndex = 0;
  buildApp();
  renderSheetTabs();
  loadSheet(0);
}

function handleError(payload: { message: string }): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `<div style="padding:24px;color:var(--vscode-errorForeground,#d32f2f);">
    <h3 style="margin-bottom:8px;">${t('parseFailed')}</h3>
    <p style="font-size:13px;">${payload.message}</p></div>`;
}

function handleCellUpdate(payload: { sheetIndex: number; rowIndex: number; field: string; value: unknown }): void {
  if (payload.sheetIndex !== currentSheetIndex || !gridApi) return;
  const node = gridApi.getRowNode(String(payload.rowIndex));
  if (node) {
    _suppressEdit = true;
    node.setDataValue(payload.field, payload.value);
    _suppressEdit = false;
  }
}

// ===================== Init =====================

currentLang = detectLang();
injectStyles();

// 监听主题切换，自动更新 AG Grid 主题配置
const themeObserver = new MutationObserver(() => {
  if (gridApi) {
    gridApi.setGridOption('theme', buildTheme());
    updateRowHighlight();
    if (activeColId) updateHeaderHighlight(null, activeColId);
  }
});
themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'data': handleData(msg.payload); break;
    case 'error': handleError(msg.payload); break;
    case 'cellUpdate': handleCellUpdate(msg.payload); break;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeFilterPopup();

  // Cmd/Ctrl+F → focus search box
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault();
    e.stopPropagation();
    const box = document.querySelector<HTMLInputElement>('.dv-search');
    if (box) { box.focus(); box.select(); }
  }
});

// 优先检查是否有直出的初始数据，消除 IPC 握手往返延迟
const initDataEl = document.getElementById('dv-init-data');
if (initDataEl && initDataEl.textContent) {
  try {
    const initPayload = JSON.parse(initDataEl.textContent);
    handleData(initPayload);
  } catch (e) {
    console.error('Failed to parse init data, falling back to ready message', e);
    vscode.postMessage({ type: 'ready' });
  }
} else {
  vscode.postMessage({ type: 'ready' });
}
