import * as vscode from 'vscode';
import { ContextInfo } from './types';
import { getRustContextAST } from './rustTreeSitterContext';

export type { ContextInfo } from './types';

export async function getContextInfo(
  doc: vscode.TextDocument,
  position: vscode.Position,
  selection?: { startLine: number; endLine: number }
): Promise<ContextInfo> {
  const id = doc.languageId;

  if (id === 'rust') {
    return getRustContextAST(doc, position, selection);
  }

  // TODO: dispatch to other language strategies
  return {};
}

