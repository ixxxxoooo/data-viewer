import * as fs from 'fs';

export const Uri = {
  file: (filePath: string) => ({
    fsPath: filePath,
    scheme: 'file',
    toString: () => `file://${filePath}`,
  }),
  joinPath: (...parts: unknown[]) => ({ fsPath: parts.join('/') }),
};

export class EventEmitter<T = any> {
  event = (listener: (e: T) => any) => ({ dispose: () => {} });
  fire(_data?: T): void {}
  dispose(): void {}
}

export const workspace = {
  fs: {
    readFile: async (uri: { fsPath: string }) => fs.readFileSync(uri.fsPath),
    stat: async (uri: { fsPath: string }) => {
      const s = fs.statSync(uri.fsPath);
      return { mtime: s.mtimeMs, size: s.size };
    },
    writeFile: async (uri: { fsPath: string }, content: Buffer) => fs.writeFileSync(uri.fsPath, content),
    delete: async (uri: { fsPath: string }) => fs.unlinkSync(uri.fsPath),
  },
};

export const window = {
  registerCustomEditorProvider: () => ({ dispose: () => {} }),
  showErrorMessage: () => {},
};

export enum ViewColumn {
  One = 1,
}
