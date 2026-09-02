export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file' }),
  joinPath: (...parts: unknown[]) => ({ fsPath: parts.join('/') }),
};

export const workspace = {
  fs: {
    readFile: async () => Buffer.from(''),
  },
};

export const window = {
  registerCustomEditorProvider: () => ({ dispose: () => {} }),
  showErrorMessage: () => {},
};

export enum ViewColumn {
  One = 1,
}
