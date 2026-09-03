import * as vscode from 'vscode';
import * as path from 'path';
import { parseCsvFromBuffer, serializeCsv } from './parsers/csvParser';
import { parseExcel, serializeExcel } from './parsers/excelParser';
import { ParseResult } from './parsers/types';

interface CellEdit {
  sheetIndex: number;
  rowIndex: number;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

class DataDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;
  private _data: ParseResult;
  private _parseTimeMs: number;
  private _fileSizeBytes: number;

  constructor(uri: vscode.Uri, data: ParseResult, parseTimeMs: number, fileSizeBytes: number) {
    this.uri = uri;
    this._data = data;
    this._parseTimeMs = parseTimeMs;
    this._fileSizeBytes = fileSizeBytes;
  }

  get data(): ParseResult { return this._data; }
  get parseTimeMs(): number { return this._parseTimeMs; }
  get fileSizeBytes(): number { return this._fileSizeBytes; }

  applyEdit(edit: CellEdit): void {
    const sheet = this._data.sheets[edit.sheetIndex];
    if (sheet?.rows[edit.rowIndex]) {
      sheet.rows[edit.rowIndex][edit.field] = edit.newValue;
    }
  }

  undoEdit(edit: CellEdit): void {
    const sheet = this._data.sheets[edit.sheetIndex];
    if (sheet?.rows[edit.rowIndex]) {
      sheet.rows[edit.rowIndex][edit.field] = edit.oldValue;
    }
  }

  replaceData(data: ParseResult, parseTimeMs: number, fileSizeBytes: number): void {
    this._data = data;
    this._parseTimeMs = parseTimeMs;
    this._fileSizeBytes = fileSizeBytes;
  }

  dispose(): void {}
}

interface CacheEntry {
  mtime: number;
  size: number;
  data: ParseResult;
  parseTimeMs: number;
}

function cloneParseResult(result: ParseResult): ParseResult {
  return {
    fileName: result.fileName,
    sheets: result.sheets.map((s) => ({
      name: s.name,
      headers: [...s.headers],
      rows: s.rows.map((r) => ({ ...r })),
    })),
  };
}

class ParseCache {
  private static readonly MAX_SIZE = 10;
  private readonly cache = new Map<string, CacheEntry>();

  get(uri: vscode.Uri, stat: vscode.FileStat): { data: ParseResult; parseTimeMs: number } | null {
    const key = uri.toString();
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.mtime !== stat.mtime || entry.size !== stat.size) {
      this.cache.delete(key);
      return null;
    }
    // 刷新 LRU 顺序
    this.cache.delete(key);
    this.cache.set(key, entry);
    return { data: cloneParseResult(entry.data), parseTimeMs: 0 };
  }

  set(uri: vscode.Uri, stat: vscode.FileStat, data: ParseResult, parseTimeMs: number): void {
    const key = uri.toString();
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= ParseCache.MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      mtime: stat.mtime,
      size: stat.size,
      data: cloneParseResult(data),
      parseTimeMs,
    });
  }

  delete(uri: vscode.Uri): void {
    this.cache.delete(uri.toString());
  }
}

export class DataViewerProvider implements vscode.CustomEditorProvider<DataDocument> {
  private static readonly viewTypes = ['dataViewer.csvEditor', 'dataViewer.excelEditor'];
  private readonly webviews = new Map<string, vscode.Webview>();
  private readonly parseCache = new ParseCache();

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<DataDocument> | vscode.CustomDocumentContentChangeEvent<DataDocument>
  >();
  readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    const provider = new DataViewerProvider(context);
    return this.viewTypes.map((viewType) =>
      vscode.window.registerCustomEditorProvider(viewType, provider, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      })
    );
  }

  // ---- Document Lifecycle ----

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<DataDocument> {
    const { parseResult, parseTimeMs, fileSizeBytes } = await this.parseFile(uri);
    return new DataDocument(uri, parseResult, parseTimeMs, fileSizeBytes);
  }

  async resolveCustomEditor(
    document: DataDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const key = document.uri.toString();
    const webview = webviewPanel.webview;

    this.webviews.set(key, webview);
    webviewPanel.onDidDispose(() => this.webviews.delete(key));

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ],
    };

    webview.html = this.getHtml(webview, document);

    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          webview.postMessage({
            type: 'data',
            payload: {
              ...document.data,
              parseTimeMs: document.parseTimeMs,
              fileSizeBytes: document.fileSizeBytes,
              lang: vscode.env.language?.startsWith('zh') ? 'zh' : 'en',
            },
          });
          break;
        case 'edit':
          this.handleEdit(document, message.payload as CellEdit);
          break;
      }
    });
  }

  // ---- Edit Handling ----

  private handleEdit(document: DataDocument, edit: CellEdit): void {
    document.applyEdit(edit);

    this._onDidChangeCustomDocument.fire({
      document,
      label: 'Edit Cell',
      undo: async () => {
        document.undoEdit(edit);
        this.sendCellUpdate(document, edit.sheetIndex, edit.rowIndex, edit.field, edit.oldValue);
      },
      redo: async () => {
        document.applyEdit(edit);
        this.sendCellUpdate(document, edit.sheetIndex, edit.rowIndex, edit.field, edit.newValue);
      },
    });
  }

  private sendCellUpdate(doc: DataDocument, sheetIndex: number, rowIndex: number, field: string, value: unknown): void {
    const webview = this.webviews.get(doc.uri.toString());
    webview?.postMessage({
      type: 'cellUpdate',
      payload: { sheetIndex, rowIndex, field, value },
    });
  }

  // ---- Save / Revert / Backup ----

  async saveCustomDocument(document: DataDocument, _token: vscode.CancellationToken): Promise<void> {
    await this.writeFile(document.uri, document.data);
  }

  async saveCustomDocumentAs(document: DataDocument, destination: vscode.Uri, _token: vscode.CancellationToken): Promise<void> {
    await this.writeFile(destination, document.data);
  }

  async revertCustomDocument(document: DataDocument, _token: vscode.CancellationToken): Promise<void> {
    this.parseCache.delete(document.uri);
    const { parseResult, parseTimeMs, fileSizeBytes } = await this.parseFile(document.uri);
    document.replaceData(parseResult, parseTimeMs, fileSizeBytes);

    const webview = this.webviews.get(document.uri.toString());
    webview?.postMessage({
      type: 'data',
      payload: { ...parseResult, parseTimeMs, fileSizeBytes },
    });
  }

  async backupCustomDocument(
    document: DataDocument,
    context: vscode.CustomDocumentBackupContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    await this.writeFile(context.destination, document.data);
    return {
      id: context.destination.toString(),
      delete: async () => {
        try { await vscode.workspace.fs.delete(context.destination); } catch { /* ignore */ }
      },
    };
  }

  // ---- Internal Helpers ----

  private async parseFile(uri: vscode.Uri): Promise<{
    parseResult: ParseResult;
    parseTimeMs: number;
    fileSizeBytes: number;
  }> {
    let stat: vscode.FileStat | undefined;
    try {
      stat = await vscode.workspace.fs.stat(uri);
      const cached = this.parseCache.get(uri, stat);
      if (cached) {
        return { parseResult: cached.data, parseTimeMs: cached.parseTimeMs, fileSizeBytes: stat.size };
      }
    } catch {
      // stat 失败时忽略，继续直接读取
    }

    const data = await vscode.workspace.fs.readFile(uri);
    const buffer = Buffer.from(data);
    const fileName = path.basename(uri.fsPath);
    const ext = path.extname(uri.fsPath).toLowerCase();

    const startTime = Date.now();
    const parseResult = (ext === '.csv' || ext === '.tsv')
      ? parseCsvFromBuffer(buffer, fileName)
      : parseExcel(buffer, fileName);
    const parseTimeMs = Date.now() - startTime;

    if (stat) {
      this.parseCache.set(uri, stat, parseResult, parseTimeMs);
    }

    return { parseResult, parseTimeMs, fileSizeBytes: data.byteLength };
  }

  private async writeFile(uri: vscode.Uri, data: ParseResult): Promise<void> {
    this.parseCache.delete(uri);
    const ext = path.extname(uri.fsPath).toLowerCase();
    const content = (ext === '.csv' || ext === '.tsv')
      ? Buffer.from(serializeCsv(data), 'utf-8')
      : serializeExcel(data);
    await vscode.workspace.fs.writeFile(uri, content);
  }

  private getHtml(webview: vscode.Webview, document: DataDocument): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js')
    );
    const nonce = getNonce();
    const initialPayload = {
      ...document.data,
      parseTimeMs: document.parseTimeMs,
      fileSizeBytes: document.fileSizeBytes,
      lang: vscode.env.language?.startsWith('zh') ? 'zh' : 'en',
    };
    const serializedData = JSON.stringify(initialPayload).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Data Viewer</title>
</head>
<body>
  <div id="app">
    <div class="dv-loading"><div class="dv-spinner"></div><span>Loading...</span></div>
  </div>
  <script id="dv-init-data" type="application/json" nonce="${nonce}">${serializedData}</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
