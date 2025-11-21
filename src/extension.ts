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

            const lang = detectLanguage(relativePath);

            // for the best output format for Vibe Coding
            const output =
`**Source:** \`${relativePath}\`
**Lines:** ${startLine}-${endLine}

\`\`\`${lang}
${selectedText}
\`\`\`
`;

            await vscode.env.clipboard.writeText(output);
            vscode.window.showInformationMessage("Copied code with context!");
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}
