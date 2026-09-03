import * as vscode from 'vscode';
import { DataViewerProvider } from '../../src/dataViewerProvider';
import * as path from 'path';

describe('DataViewerProvider - 缓存测试', () => {
  const sampleUri = vscode.Uri.file(path.join(__dirname, '..', 'fixtures', 'sample.xlsx'));

  test('重复打开相同未修改的文件应命中缓存并极速返回', async () => {
    const context = {
      extensionUri: vscode.Uri.file('/tmp'),
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    const provider = new DataViewerProvider(context);

    const doc1 = await provider.openCustomDocument(sampleUri, {} as any, {} as any);
    expect(doc1.data.sheets).toHaveLength(2);

    const doc2 = await provider.openCustomDocument(sampleUri, {} as any, {} as any);
    expect(doc2.data.sheets).toHaveLength(2);
    // 缓存命中后 parseTimeMs 为 0
    expect(doc2.parseTimeMs).toBe(0);
  });
});
