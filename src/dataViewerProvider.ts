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

export class DataViewerProvider implements vscode.CustomEditorProvider<DataDocument> {
  private static readonly viewTypes = ['dataViewer.csvEditor', 'dataViewer.excelEditor'];
  private readonly webviews = new Map<string, vscode.Webview>();

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

  // ---- 文档生命周期 ----

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

    webview.html = this.getHtml(webview);

    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          webview.postMessage({
            type: 'data',
            payload: {
              ...document.data,
              parseTimeMs: document.parseTimeMs,
              fileSizeBytes: document.fileSizeBytes,
            },
          });
          break;
        case 'edit':
          this.handleEdit(document, message.payload as CellEdit);
          break;
      }
    });
  }

  // ---- 编辑处理 ----

  private handleEdit(document: DataDocument, edit: CellEdit): void {
    document.applyEdit(edit);

    this._onDidChangeCustomDocument.fire({
      document,
      label: '编辑单元格',
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

  // ---- 保存 / 还原 / 备份 ----

  async saveCustomDocument(document: DataDocument, _token: vscode.CancellationToken): Promise<void> {
    await this.writeFile(document.uri, document.data);
  }

  async saveCustomDocumentAs(document: DataDocument, destination: vscode.Uri, _token: vscode.CancellationToken): Promise<void> {
    await this.writeFile(destination, document.data);
  }

  async revertCustomDocument(document: DataDocument, _token: vscode.CancellationToken): Promise<void> {
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
        try { await vscode.workspace.fs.delete(context.destination); } catch { /* 忽略 */ }
      },
    };
  }

  // ---- 内部工具方法 ----

  private async parseFile(uri: vscode.Uri): Promise<{
    parseResult: ParseResult;
    parseTimeMs: number;
    fileSizeBytes: number;
  }> {
    const data = await vscode.workspace.fs.readFile(uri);
    const buffer = Buffer.from(data);
    const fileName = path.basename(uri.fsPath);
    const ext = path.extname(uri.fsPath).toLowerCase();

    const startTime = Date.now();
    const parseResult = (ext === '.csv' || ext === '.tsv')
      ? parseCsvFromBuffer(buffer, fileName)
      : parseExcel(buffer, fileName);
    const parseTimeMs = Date.now() - startTime;

    return { parseResult, parseTimeMs, fileSizeBytes: data.byteLength };
  }

  private async writeFile(uri: vscode.Uri, data: ParseResult): Promise<void> {
    const ext = path.extname(uri.fsPath).toLowerCase();
    const content = (ext === '.csv' || ext === '.tsv')
      ? Buffer.from(serializeCsv(data), 'utf-8')
      : serializeExcel(data);
    await vscode.workspace.fs.writeFile(uri, content);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>数据表查看器</title>
</head>
<body>
  <div id="app">
    <div class="dv-loading"><div class="dv-spinner"></div><span>正在加载...</span></div>
  </div>
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
