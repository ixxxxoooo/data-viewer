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
interface DataPayload { fileName: string; sheets: SheetData[]; parseTimeMs: number; fileSizeBytes: number }

let gridApi: GridApi | null = null;
let allSheets: SheetData[] = [];
let currentSheetIndex = 0;
let dataPayloadCache: DataPayload | null = null;
let _suppressEdit = false;

// ===================== 外部筛选系统 =====================

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

// ===================== 筛选弹窗 =====================

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

  const allVals = new Set<string>();
  gridApi.forEachNode((node: any) => {
    if (!node.data) return;
    const v = node.data[field];
    allVals.add(v == null ? '' : String(v));
  });
  const sorted = [...allVals].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const current = columnFilters.get(field);
  const staged = current ? new Set(current) : new Set(sorted);

  const overlay = document.createElement('div');
  overlay.className = 'dv-fp-overlay';
  overlay.addEventListener('mousedown', () => closeFilterPopup());

  const popup = document.createElement('div');
  popup.className = 'dv-fp';
  popup.addEventListener('mousedown', (e) => e.stopPropagation());

  // 搜索框
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = '搜索...';
  search.className = 'dv-fp-search';
  popup.appendChild(search);

  // 全选
  const allRow = document.createElement('div');
  allRow.className = 'dv-fp-row';
  const allCb = document.createElement('input');
  allCb.type = 'checkbox';
  allCb.checked = staged.size === sorted.length;
  allCb.className = 'dv-fp-cb';
  const allLbl = document.createElement('span');
  allLbl.className = 'dv-fp-lbl';
  allLbl.textContent = '全选';
  allRow.appendChild(allCb);
  allRow.appendChild(allLbl);
  popup.appendChild(allRow);

  // 值列表
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
      lbl.textContent = v || '(空)';
      if (!v) lbl.style.opacity = '0.5';
      row.appendChild(cb);
      row.appendChild(lbl);
      list.appendChild(row);
      cbMap.set(v, cb);
    }
    if (vals.length > limit) {
      const n = document.createElement('div');
      n.className = 'dv-fp-note';
      n.textContent = `显示前 ${limit} 个（共 ${vals.length} 个）`;
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

  renderList(sorted);

  // 按钮行
  const btnRow = document.createElement('div');
  btnRow.className = 'dv-fp-btns';
  btnRow.appendChild(makeBtn('应用', true, () => {
    if (staged.size === sorted.length) columnFilters.delete(field);
    else columnFilters.set(field, new Set(staged));
    gridApi?.onFilterChanged();
    closeFilterPopup();
    updateFilterIcons();
    updateStatus(allSheets[currentSheetIndex]);
  }));
  btnRow.appendChild(makeBtn('取消', false, () => closeFilterPopup()));
  btnRow.appendChild(makeBtn('清除', false, () => {
    columnFilters.delete(field);
    gridApi?.onFilterChanged();
    closeFilterPopup();
    updateFilterIcons();
    updateStatus(allSheets[currentSheetIndex]);
  }));
  popup.appendChild(btnRow);

  document.body.appendChild(overlay);
  document.body.appendChild(popup);

  // 定位弹窗
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

// ===================== 自定义列头组件 =====================

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
    this.filterEl.title = '筛选';

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
  refresh(): boolean { this.refreshSort(); this.refreshFilter(); return true; }
  destroy(): void {}
}

function updateFilterIcons(): void {
  if (!gridApi) return;
  gridApi.refreshHeader();
}

// ===================== 工具函数 =====================

function isDark(): boolean {
  return document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

// ===================== 主题 =====================

function buildTheme(): Theme {
  const d = isDark();
  return themeQuartz.withParams(d ? {
    backgroundColor: '#1e1e1e', foregroundColor: '#d4d4d4',
    headerBackgroundColor: '#2d2d2d', headerForegroundColor: '#cccccc',
    borderColor: '#404040', rowHoverColor: '#2a2d2e',
    selectedRowBackgroundColor: '#094771', oddRowBackgroundColor: '#252526',
    headerFontSize: 12, fontSize: 12, spacing: 3, wrapperBorderRadius: 0,
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    headerColumnResizeHandleHeight: '0%', cellHorizontalPaddingScale: 0.6,
  } : {
    backgroundColor: '#ffffff', foregroundColor: '#333333',
    headerBackgroundColor: '#f0f0f0', headerForegroundColor: '#333333',
    borderColor: '#d4d4d4', rowHoverColor: '#e8f4fd',
    selectedRowBackgroundColor: '#c7e0f4', oddRowBackgroundColor: '#fafafa',
    headerFontSize: 12, fontSize: 12, spacing: 3, wrapperBorderRadius: 0,
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    headerColumnResizeHandleHeight: '0%', cellHorizontalPaddingScale: 0.6,
  });
}

// ===================== 加载表格 =====================

function loadSheet(index: number): void {
  const sheet = allSheets[index];
  if (!sheet) return;

  columnFilters.clear();
  sheet.rows.forEach((r, i) => { (r as any).__dvIdx = i; });

  const rowNumCol: ColDef = {
    headerName: '#',
    valueGetter: (p) => p.node ? p.node.rowIndex! + 1 : '',
    width: 52, minWidth: 40, maxWidth: 72,
    pinned: 'left', sortable: false, resizable: false, editable: false,
    suppressMovable: true, suppressHeaderMenuButton: true,
    cellStyle: {
      color: 'var(--ag-secondary-foreground-color,#888)',
      backgroundColor: 'var(--ag-header-background-color)',
      fontWeight: '400', textAlign: 'center',
    },
  };

  const dataCols: ColDef[] = sheet.headers.map((h) => ({
    field: h, headerName: h,
    headerComponent: FilterHeader,
    sortable: true, resizable: true, editable: true,
    minWidth: 72, cellDataType: false,
    suppressHeaderMenuButton: true,
    valueSetter: (params: any) => {
      const raw = params.newValue;
      if (raw === params.oldValue) return false;
      const num = Number(raw);
      params.data[params.colDef.field!] = (raw !== '' && raw != null && !isNaN(num)) ? num : raw;
      return true;
    },
  }));

  const container = document.getElementById('dv-grid')!;
  if (gridApi) { gridApi.destroy(); gridApi = null; }
  container.innerHTML = '';

  const opts: GridOptions = {
    theme: buildTheme(),
    columnDefs: [rowNumCol, ...dataCols],
    rowData: sheet.rows,
    getRowId: (p) => String(p.data.__dvIdx),
    defaultColDef: { flex: 1, minWidth: 80, sortable: true, resizable: true },
    isExternalFilterPresent,
    doesExternalFilterPass,
    animateRows: false,
    rowBuffer: 30,
    suppressColumnVirtualisation: false,
    rowSelection: 'multiple' as const,
    enableCellTextSelection: true,
    ensureDomOrder: true,
    stopEditingWhenCellsLoseFocus: true,
    singleClickEdit: false,
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

// ===================== 状态栏 =====================

function updateStatus(sheet: SheetData): void {
  const el = document.getElementById('dv-status');
  if (!el || !gridApi) return;
  const displayed = gridApi.getDisplayedRowCount();
  const total = sheet.rows.length;
  const p: string[] = [];
  if (dataPayloadCache) p.push(dataPayloadCache.fileName);
  if (allSheets.length > 1) p.push(`[${sheet.name}]`);
  p.push(`共 ${total.toLocaleString()} 行`);
  if (displayed !== total) p.push(`筛选后 ${displayed.toLocaleString()} 行`);
  if (dataPayloadCache) {
    p.push(fmtSize(dataPayloadCache.fileSizeBytes));
    p.push(`${dataPayloadCache.parseTimeMs}ms`);
  }
  el.textContent = p.join('  ·  ');
}

// ===================== Sheet 标签 =====================

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

// ===================== UI 构建 =====================

let appBuilt = false;
let searchTimer: number;

function buildApp(): void {
  if (appBuilt) return;
  appBuilt = true;

  const app = document.getElementById('app')!;
  app.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'dv-toolbar';

  const searchBox = document.createElement('input');
  searchBox.type = 'text';
  searchBox.className = 'dv-search';
  searchBox.placeholder = '搜索全部列...';
  searchBox.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      gridApi?.setGridOption('quickFilterText', searchBox.value);
    }, 120);
  });
  toolbar.appendChild(searchBox);

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

// ===================== 样式 =====================

function injectStyles(): void {
  const s = document.createElement('style');
  s.textContent = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  font-size:13px;
  background:var(--vscode-editor-background,#fff);
  color:var(--vscode-editor-foreground,#333)}
#app{display:flex;flex-direction:column;height:100vh;overflow:hidden}

/* 加载中 */
.dv-loading{display:flex;align-items:center;justify-content:center;height:100vh;
  color:var(--vscode-descriptionForeground,#888);font-size:13px;gap:8px}
.dv-spinner{width:18px;height:18px;border:2px solid var(--vscode-descriptionForeground,#888);
  border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* 工具栏 */
.dv-toolbar{display:flex;align-items:center;gap:10px;padding:4px 8px;
  background:var(--vscode-editorWidget-background,#f3f3f3);
  border-bottom:1px solid var(--vscode-editorWidget-border,#d4d4d4);flex-shrink:0}
.dv-search{padding:3px 8px;width:220px;
  border:1px solid var(--vscode-input-border,#cecece);border-radius:3px;
  background:var(--vscode-input-background,#fff);
  color:var(--vscode-input-foreground,#333);font-size:12px;outline:none}
.dv-search:focus{border-color:var(--vscode-focusBorder,#0078d4)}
.dv-search::placeholder{color:var(--vscode-input-placeholderForeground,#999)}
.dv-status{font-size:11px;margin-left:auto;white-space:nowrap;
  color:var(--vscode-descriptionForeground,#888)}

/* 表格 */
#dv-grid{flex:1;overflow:hidden}

/* 单元格竖线 */
.ag-cell{border-right:1px solid var(--ag-border-color,#ddd) !important}
.ag-header-cell{border-right:1px solid var(--ag-border-color,#ddd) !important}

/* 自定义列头 */
.dv-ch{display:flex;align-items:center;width:100%;height:100%;gap:2px;
  user-select:none;padding:0 2px}
.dv-ch-text{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  cursor:pointer;font-weight:500}
.dv-ch-sort{font-size:11px;opacity:.6;flex-shrink:0}
.dv-ch-filter{cursor:pointer;font-size:9px;padding:2px 4px;border-radius:3px;
  opacity:.4;flex-shrink:0;transition:all .15s}
.dv-ch-filter:hover{opacity:.9;background:var(--vscode-list-hoverBackground,rgba(0,0,0,.06))}
.dv-ch-filter.active{opacity:1;color:var(--vscode-focusBorder,#0078d4)}

/* Sheet 标签 */
.dv-sheet-bar{display:flex;align-items:stretch;
  background:var(--vscode-editorWidget-background,#f3f3f3);
  border-top:1px solid var(--vscode-editorWidget-border,#d4d4d4);
  flex-shrink:0;overflow-x:auto;min-height:0}
.dv-sheet-bar:empty{display:none}
.dv-sheet-tab{padding:5px 18px;cursor:pointer;font-size:11px;
  border:none;background:transparent;
  color:var(--vscode-descriptionForeground,#666);
  border-top:2px solid transparent;
  border-right:1px solid var(--vscode-editorWidget-border,#d4d4d4);
  white-space:nowrap;transition:background .1s}
.dv-sheet-tab:hover{background:var(--vscode-list-hoverBackground,rgba(0,0,0,.04))}
.dv-sheet-tab.active{background:var(--vscode-editor-background,#fff);
  color:var(--vscode-editor-foreground,#333);font-weight:600;
  border-top-color:var(--vscode-focusBorder,#0078d4)}

/* ===== 筛选弹窗 ===== */
.dv-fp-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:999}
.dv-fp{position:fixed;z-index:1000;width:250px;max-height:380px;
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
.dv-fp-lbl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none}
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

// ===================== 数据处理 =====================

function handleData(payload: DataPayload): void {
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
    <h3 style="margin-bottom:8px;">文件解析失败</h3>
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

// ===================== 初始化 =====================

injectStyles();

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
});

vscode.postMessage({ type: 'ready' });
