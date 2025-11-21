import * as vscode from 'vscode';
import * as path from 'path';

// Identify the language of the file for the code block
function detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case ".rs": return "rust";
        case ".ts": return "typescript";
        case ".js": return "javascript";
        case ".go": return "go";
        case ".cpp":
        case ".cc":
        case ".cxx":
        case ".h":
        case ".hpp": return "cpp";
        case ".py": return "python";
        case ".java": return "java";
        default: return "";
    }
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        'copyCodeWithContext.copy',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage("No active editor");
                return;
            }

            const document = editor.document;
            const selection = editor.selection;

            let selectedText: string;
            let startLine: number;
            let endLine: number;

            if (selection && !selection.isEmpty) {
                selectedText = document.getText(selection);
                startLine = selection.start.line + 1;
                endLine = selection.end.line + 1;
            } else {
                selectedText = document.getText();
                startLine = 1;
                endLine = document.lineCount;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            let filePath = document.uri.fsPath;

            let relativePath = filePath;
            if (workspaceFolder) {
                relativePath = path.relative(workspaceFolder, filePath);
            }

            const lang = detectLanguage(relativePath) || document.languageId || "";

            // Build header lines from persisted settings
            type HeaderOpt = {
                id: string;
                render: () => string;
            };

            const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? "";
            const fileName = path.basename(filePath);
            const timestamp = new Date().toISOString();

            const cfg = vscode.workspace.getConfiguration('copyCodeWithContext');
            const selected = cfg.get<string[]>('headers', ['source', 'lines']);
            const plainText = cfg.get<boolean>('plainText', false);

            // Format the header line according to the plainText setting.
            const fmt = (label: string, value: string) => {
                const v = (value ?? "").toString();
                // Hide the line if value is empty/whitespace
                if (v.trim().length === 0) return "";
                if (plainText) return `${label}: ${v}`;
                // markdown
                const mdValue = (label === 'Source' || label === 'Path') ? `\`${v}\`` : v;
                return `**${label}:** ${mdValue}`;
            };

            const available: HeaderOpt[] = [
                { id: "source", render: () => fmt('Source', relativePath) },
                { id: "lines", render: () => fmt('Lines', `${startLine}-${endLine}`) },
                { id: "language", render: () => fmt('Language', lang) },
                { id: "workspace", render: () => fmt('Workspace', workspaceName) },
                { id: "file", render: () => fmt('File', fileName) },
                { id: "path", render: () => fmt('Path', filePath) },
                { id: "time", render: () => fmt('Time', timestamp) },
            ];
            const selectedIds = new Set(selected);

            const headerLines: string[] = [];
            for (const opt of available) {
                if (selectedIds.has(opt.id)) {
                    const line = opt.render();
                    if (line) headerLines.push(line);
                }
            }

            const headerBlock = headerLines.length > 0 ? headerLines.join("\n") + "\n\n" : "";
            const body = plainText ? `${selectedText}` : `\`\`\`${lang}\n${selectedText}\n\`\`\`\n`;
            const output = headerBlock + body;

            await vscode.env.clipboard.writeText(output);
            vscode.window.showInformationMessage("Copied code with context!");
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}
