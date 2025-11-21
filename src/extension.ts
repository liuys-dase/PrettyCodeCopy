import * as vscode from 'vscode';
import * as path from 'path';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);

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
        'PrettyCodeCopy.copy',
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

            // Git helpers – best-effort, empty string if unavailable
            async function getGitRoot(cwd: string): Promise<string> {
                try {
                    const { stdout } = await exec('git rev-parse --show-toplevel', { cwd });
                    return stdout.trim();
                } catch {
                    return '';
                }
            }

            async function getGitRemoteUrl(cwd: string): Promise<string> {
                try {
                    const { stdout } = await exec('git remote get-url origin', { cwd });
                    return stdout.trim();
                } catch {
                    return '';
                }
            }

            async function getGitBranch(cwd: string): Promise<string> {
                try {
                    const { stdout } = await exec('git rev-parse --abbrev-ref HEAD', { cwd });
                    return stdout.trim();
                } catch {
                    return '';
                }
            }

            async function getGitShortSha(cwd: string): Promise<string> {
                try {
                    const { stdout } = await exec('git rev-parse --short HEAD', { cwd });
                    return stdout.trim();
                } catch {
                    return '';
                }
            }

            async function getGitLastCommitTime(cwd: string): Promise<string> {
                try {
                    const { stdout } = await exec('git log -1 --format=%cI', { cwd });
                    return stdout.trim();
                } catch {
                    return '';
                }
            }

            function toHttpsRepoBase(remoteUrl: string): string {
                // Convert common git remotes to https base URL without .git suffix
                if (!remoteUrl) return '';
                let url = remoteUrl.trim();
                if (url.startsWith('git@')) {
                    // git@host:user/repo.git
                    const match = /^git@([^:]+):(.+)$/.exec(url);
                    if (match) {
                        url = `https://${match[1]}/${match[2]}`;
                    }
                }
                // Remove .git suffix
                url = url.replace(/\.git$/, '');
                if (url.startsWith('http://') || url.startsWith('https://')) {
                    return url;
                }
                return '';
            }

            function buildRepoFileUrl(base: string, commitSha: string, repoRel: string, start: number, end: number): string {
                if (!base || !commitSha || !repoRel) return '';
                // Works for GitHub/GitLab
                const anchor = start && end ? `#L${start}-L${end}` : '';
                // Ensure forward slashes for URLs
                const rel = repoRel.split(path.sep).join('/');
                return `${base}/blob/${commitSha}/${rel}${anchor}`;
            }

            // Resolve Git info in parallel
            const cwd = path.dirname(filePath);
            const [gitRoot, branch, shortSha, commitTime, remote] = await Promise.all([
                getGitRoot(cwd),
                getGitBranch(cwd),
                getGitShortSha(cwd),
                getGitLastCommitTime(cwd),
                getGitRemoteUrl(cwd),
            ]);
            const httpsBase = toHttpsRepoBase(remote);
            const repoRelPath = gitRoot ? path.relative(gitRoot, filePath) : '';
            const repoUrl = buildRepoFileUrl(httpsBase, shortSha, repoRelPath, startLine, endLine);

            const cfg = vscode.workspace.getConfiguration('PrettyCodeCopy');
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
                { id: "repoLink", render: () => fmt('Repo', repoUrl) },
                { id: "gitBranch", render: () => fmt('Branch', branch) },
                { id: "gitShortSha", render: () => fmt('SHA', shortSha) },
                { id: "gitLastCommitTime", render: () => fmt('Last Commit', commitTime) },
            ];
            const selectedIds = new Set(selected);

            const headerLines: string[] = [];
            for (const opt of available) {
                if (selectedIds.has(opt.id)) {
                    const line = opt.render();
                    if (line) headerLines.push(line);
                }
            }

            // Put a blank line between header lines for Markdown formatting
            const headerBlock = headerLines.length > 0 ? headerLines.join("\n\n") + "\n\n" : "";
            const body = plainText ? `${selectedText}` : `\`\`\`${lang}\n${selectedText}\n\`\`\`\n`;
            const output = headerBlock + body;

            await vscode.env.clipboard.writeText(output);
            vscode.window.showInformationMessage("Copied code with context!");
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}
