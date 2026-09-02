import * as vscode from 'vscode';
import { DataViewerProvider } from './dataViewerProvider';

export function activate(context: vscode.ExtensionContext) {
  const disposables = DataViewerProvider.register(context);
  context.subscriptions.push(...disposables);
}

export function deactivate() {}
