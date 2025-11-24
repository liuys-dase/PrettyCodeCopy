// rustTreeSitterContext.ts
// Rust context detection for PrettyCodeCopy using Tree-sitter.
//
// Requirements:
//   npm install web-tree-sitter
//   (and provide a compiled tree-sitter-rust.wasm file)
// 
// This module exposes a single main function:
//   getRustContextAST(doc, position, selection?) -> ContextInfo
//
// It returns functionName / className (impl type) / moduleName.

// -------------------- Imports --------------------

import * as vscode from 'vscode';
import Parser, { Tree, SyntaxNode } from 'web-tree-sitter';
import { ContextInfo } from './types';

// -------------------- Config --------------------

// You MUST ensure this path points to your compiled tree-sitter-rust.wasm.
// Typical options:
//   - context.asAbsolutePath('syntaxes/tree-sitter-rust.wasm')
//   - or bundle it into your extension out folder.
const RUST_WASM_RELATIVE_PATH = 'syntaxes/tree-sitter-rust.wasm';

// Max lines for text-based fallbacks / scanning, mostly irrelevant with AST.
const MAX_SCAN_LINES = 2000;

// -------------------- Internal Cache & Singleton --------------------

interface CachedTree {
  version: number;
  tree: Tree;
}

class RustAstContextProvider {
  private static _instance: RustAstContextProvider | null = null;

  private parser: Parser | null = null;
  private languageLoaded = false;

  // Cache per document URI (fsPath), to avoid reparsing unchanged docs.
  private treeCache: Map<string, CachedTree> = new Map();

  private constructor() {}

  public static getInstance(): RustAstContextProvider {
    if (!this._instance) {
      this._instance = new RustAstContextProvider();
    }
    return this._instance;
  }

  /**
   * Ensure the Tree-sitter parser + Rust language are initialized.
   */
  private async ensureParser(): Promise<Parser> {
    if (this.parser && this.languageLoaded) {
      return this.parser;
    }

    if (!this.parser) {
      await Parser.init();
      this.parser = new Parser();
    }

    if (!this.languageLoaded) {
      // Resolve wasm path via workspace / extension root.
      // In a real extension you usually pass the absolute path from activate().
      const wasmUri = vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders?.[0].uri ?? vscode.Uri.file(process.cwd()),
        RUST_WASM_RELATIVE_PATH
      );
      const wasmPath = wasmUri.fsPath;

      const lang = await Parser.Language.load(wasmPath);
      this.parser.setLanguage(lang);
      this.languageLoaded = true;
    }

    return this.parser!;
  }

  /**
   * Get (or parse) AST for a given document.
   */
  private async getTree(doc: vscode.TextDocument): Promise<Tree> {
    const parser = await this.ensureParser();
    const key = doc.uri.toString();
    const cached = this.treeCache.get(key);

    if (cached && cached.version === doc.version) {
      return cached.tree;
    }

    const text = doc.getText();
    const tree = parser.parse(text);

    this.treeCache.set(key, { version: doc.version, tree });
    return tree;
  }

  /**
   * Main entry: get Rust context at given position.
   */
  public async getContext(
    doc: vscode.TextDocument,
    position: vscode.Position,
    selection?: { startLine: number; endLine: number }
  ): Promise<ContextInfo> {
    try {
      const tree = await this.getTree(doc);
      const root = tree.rootNode;

      // Locate the most specific node at position
      const cursorPos = {
        row: position.line,
        column: position.character,
      };
      const node = root.namedDescendantForPosition(cursorPos, cursorPos);

      if (!node) {
        return this.buildResult(doc, undefined, undefined, undefined, undefined);
      }

      // Walk up parents to collect context
      const ctx = this.extractContextFromNodeChain(node);

      return this.buildResult(
        doc,
        ctx.functionName,
        ctx.typeName,
        ctx.modulePath,
        ctx.rawNodes
      );
    } catch (e) {
      console.error('[PrettyCodeCopy][Rust] Failed to get context via Tree-sitter:', e);
      // Fallback: at least provide module from path
      const moduleName = inferRustModuleFromPath(doc.fileName);
      return { moduleName };
    }
  }

  // -------------------- Context Extraction --------------------

  private extractContextFromNodeChain(node: SyntaxNode): {
    functionName?: string;
    typeName?: string;
    modulePath?: string;
    rawNodes: { fnNode?: SyntaxNode; implNode?: SyntaxNode; typeNode?: SyntaxNode; modNodes: SyntaxNode[] };
  } {
    let current: SyntaxNode | null = node;
    let fnNode: SyntaxNode | undefined;
    let implNode: SyntaxNode | undefined;
    let typeNode: SyntaxNode | undefined;
    const modNodes: SyntaxNode[] = [];

    // Climb up the tree collecting relevant nodes
    while (current) {
      switch (current.type) {
        case 'function_item': {
          if (!fnNode) fnNode = current;
          break;
        }
        case 'impl_item': {
          if (!implNode) implNode = current;
          break;
        }
        case 'struct_item':
        case 'enum_item':
        case 'trait_item': {
          if (!typeNode) typeNode = current;
          break;
        }
        case 'mod_item': {
          modNodes.push(current);
          break;
        }
        default:
          break;
      }
      current = current.parent;
    }

    const functionName = fnNode ? extractFunctionName(fnNode) : undefined;
    const typeName = extractTypeNameFromImplOrType(implNode, typeNode);
    const modulePath = buildModulePathFromModNodes(modNodes);

    return { functionName, typeName, modulePath, rawNodes: { fnNode, implNode, typeNode, modNodes } };
  }

  /**
   * Build final ContextInfo with filename-based module fallback and functionName decoration.
   */
  private buildResult(
    doc: vscode.TextDocument,
    functionName?: string,
    typeName?: string,
    modulePath?: string,
    rawNodes?: { fnNode?: SyntaxNode; implNode?: SyntaxNode; typeNode?: SyntaxNode; modNodes: SyntaxNode[] }
  ): ContextInfo {
    let finalFunctionName = functionName;
    if (finalFunctionName && typeName && !finalFunctionName.includes("::")) {
      finalFunctionName = `${typeName}::${finalFunctionName}`;
    }

    // If modulePath from AST is empty, fallback to path-based inference.
    const moduleName = modulePath ?? inferRustModuleFromPath(doc.fileName);

    return {
      functionName: finalFunctionName,
      className: typeName,
      moduleName,
      extra: rawNodes ? {
        hasImpl: rawNodes.implNode ? 'true' : 'false',
        hasType: rawNodes.typeNode ? 'true' : 'false',
        modDepth: String(rawNodes.modNodes.length),
      } : undefined,
    };
  }
}

// -------------------- Helpers: Extraction --------------------

/**
 * Extract function name from a function_item node.
 */
function extractFunctionName(fnNode: SyntaxNode): string | undefined {
  const nameField = fnNode.childForFieldName('name');
  if (nameField) return nameField.text;

  // Fallback: find first identifier child
  for (const child of fnNode.namedChildren) {
    if (child.type === 'identifier') {
      return child.text;
    }
  }
  return undefined;
}

/**
 * Extract type name from impl_item / struct_item / enum_item / trait_item.
 */
function extractTypeNameFromImplOrType(
  implNode?: SyntaxNode,
  typeNode?: SyntaxNode
): string | undefined {
  // Prefer impl's type
  if (implNode) {
    const typeField = implNode.childForFieldName('type');
    if (typeField) {
      // Strip generic arguments, e.g. "MyType<T>" -> "MyType"
      return stripGenericSuffix(typeField.text);
    }
  }

  if (typeNode) {
    const nameField = typeNode.childForFieldName('name');
    if (nameField) return nameField.text;
    // Fallback: first type_identifier
    for (const child of typeNode.namedChildren) {
      if (child.type === 'type_identifier') return child.text;
    }
  }

  return undefined;
}

/**
 * Build module path from collected mod_item nodes: inner-most first.
 */
function buildModulePathFromModNodes(modNodes: SyntaxNode[]): string | undefined {
  if (!modNodes.length) return undefined;
  // modNodes were collected from inner to outer while climbing parents
  const names: string[] = [];
  for (let i = modNodes.length - 1; i >= 0; i--) {
    const mod = modNodes[i];
    const nameField = mod.childForFieldName('name');
    if (nameField) names.push(nameField.text);
  }
  if (!names.length) return undefined;
  return names.join('::');
}

/**
 * Strip generic argument suffix, roughly: "MyType<T, U>" -> "MyType".
 * This is a simple heuristic and not a full parser.
 */
function stripGenericSuffix(text: string): string {
  const angleIndex = text.indexOf('<');
  if (angleIndex === -1) return text.trim();
  return text.slice(0, angleIndex).trim();
}

// -------------------- Helpers: Path-based module inference --------------------

/**
 * Path-based Rust module inference (fallback when AST mod info is not enough).
 * 
 * Rules (simplified):
 *   - src/lib.rs, src/main.rs: moduleName = undefined (crate root)
 *   - src/foo/mod.rs → "foo"
 *   - src/foo/bar.rs → "foo::bar"
 */
function inferRustModuleFromPath(fileName: string): string | undefined {
  const normalized = fileName.replace(/\\/g, '/');

  const srcIndex = normalized.lastIndexOf('/src/');
  if (srcIndex < 0) return undefined;

  let rel = normalized.slice(srcIndex + 5); // after "/src/"
  // Remove extension
  rel = rel.replace(/\.rs$/, '');

  // Handle lib.rs / main.rs
  if (rel === 'lib' || rel === 'main') {
    return undefined;
  }

  // Handle mod.rs -> use parent directory
  if (rel.endsWith('/mod')) {
    rel = rel.slice(0, -('/mod'.length));
  }

  if (!rel) return undefined;

  const parts = rel.split('/');
  return parts.join('::');
}

// -------------------- Public API --------------------

/**
 * Public entry for PrettyCodeCopy:
 * Get Rust context at a given position using Tree-sitter AST.
 */
export async function getRustContextAST(
  doc: vscode.TextDocument,
  position: vscode.Position,
  selection?: { startLine: number; endLine: number }
): Promise<ContextInfo> {
  const provider = RustAstContextProvider.getInstance();
  return provider.getContext(doc, position, selection);
}

