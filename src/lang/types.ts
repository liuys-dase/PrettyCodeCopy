import * as vscode from 'vscode';

export interface ContextInfo {
  functionName?: string;
  className?: string;
  moduleName?: string;
  extra?: Record<string, string>;
}

export type GetContextFn = (
  doc: vscode.TextDocument,
  position: vscode.Position,
  selection?: { startLine: number; endLine: number }
) => Promise<ContextInfo>;

