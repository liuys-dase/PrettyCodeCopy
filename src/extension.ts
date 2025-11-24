import * as vscode from 'vscode';
import * as path from 'path';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { getContextInfo, ContextInfo } from './lang';

// 将 Node.js 回调风格的 exec 转为 Promise 形式，便于使用 async/await
const exec = promisify(execCb);

// 根据文件后缀识别语言，用于 Markdown 代码围栏的语言标识
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
    let disposable = vscode.commands.registerCommand('PrettyCodeCopy.copy', async () => {
        // 1) 获取活动编辑器
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor");
            return;
        }

        // 2) 上下文：编辑器与选区、路径与语言
        const ctx = getEditorContext(editor);

        // 3) Git 信息解析（用于 repo 链接与提交信息）
        const git = await resolveGitInfo(ctx.filePath, ctx.startLine, ctx.endLine);

        // 4) 读取设置
        const settings = getSettings();

        // 5) 代码结构上下文（语言适配器）
        const position = editor.selection?.start ?? new vscode.Position(ctx.startLine - 1, 0);
        const codeCtx: ContextInfo = await getContextInfo(
            ctx.document,
            position,
            { startLine: ctx.startLine - 1, endLine: ctx.endLine - 1 },
        );

        // 6) 渲染 Header
        const fmt = makeFormatter(settings.plainText);
        const filePathProviders = getFilePathHeaderProviders(ctx, git, fmt);
        const codeStructureProviders = getCodeStructureHeaderProviders(codeCtx, fmt);
        const headerLines = [
            ...renderSelected(settings.filePathHeaderIds, filePathProviders),
            ...renderSelected(settings.codeStructureHeaderIds, codeStructureProviders),
        ];

        // 7) 组装输出并复制
        const output = buildOutput(headerLines, settings.plainText, ctx.lang, ctx.selectedText);
        await vscode.env.clipboard.writeText(output);
        vscode.window.showInformationMessage("Copied code with context!");
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

// —— 下方为模块化的辅助类型与函数 ——

// Header 选项类型：包含唯一 id 与渲染函数
type HeaderOpt = { id: string; render: () => string };

// 编辑器上下文：包含文本/行号/路径/语言等
type EditorContext = {
    document: vscode.TextDocument;
    selectedText: string;
    startLine: number;
    endLine: number;
    filePath: string;
    relativePath: string;
    workspaceName: string;
    fileName: string;
    lang: string;
};

// 设置项快照：仅读取 package.json 中的最新键名
type Settings = {
    filePathHeaderIds: string[];
    codeStructureHeaderIds: string[];
    plainText: boolean;
};

// Git 信息聚合
type GitInfo = {
    gitRoot: string;
    branch: string;
    shortSha: string;
    commitTime: string;
    remote: string;
    httpsBase: string;
    repoRelPath: string;
    repoUrl: string;
};

// 从编辑器计算文本、行号、路径与语言
function getEditorContext(editor: vscode.TextEditor): EditorContext {
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
    const filePath = document.uri.fsPath;
    const relativePath = workspaceFolder ? path.relative(workspaceFolder, filePath) : filePath;
    const lang = detectLanguage(relativePath) || document.languageId || "";
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? "";
    const fileName = path.basename(filePath);

    return { document, selectedText, startLine, endLine, filePath, relativePath, workspaceName, fileName, lang };
}

// 读取扩展设置（仅使用最新键名）
function getSettings(): Settings {
    const cfg = vscode.workspace.getConfiguration('PrettyCodeCopy');
    const filePathHeaderIds = cfg.get<string[]>('filePathHeaders', ['source', 'lines']) ?? ['source', 'lines'];
    const codeStructureHeaderIds = cfg.get<string[]>('codeStructureHeaders', []) ?? [];
    const plainText = cfg.get<boolean>('plainText', false) ?? false;
    return { filePathHeaderIds, codeStructureHeaderIds, plainText };
}

// Git 命令封装（获取失败返回空字符串）
async function getGitRoot(cwd: string): Promise<string> {
    try { const { stdout } = await exec('git rev-parse --show-toplevel', { cwd }); return stdout.trim(); } catch { return ''; }
}
async function getGitRemoteUrl(cwd: string): Promise<string> {
    try { const { stdout } = await exec('git remote get-url origin', { cwd }); return stdout.trim(); } catch { return ''; }
}
async function getGitBranch(cwd: string): Promise<string> {
    try { const { stdout } = await exec('git rev-parse --abbrev-ref HEAD', { cwd }); return stdout.trim(); } catch { return ''; }
}
async function getGitShortSha(cwd: string): Promise<string> {
    try { const { stdout } = await exec('git rev-parse --short HEAD', { cwd }); return stdout.trim(); } catch { return ''; }
}
async function getGitLastCommitTime(cwd: string): Promise<string> {
    try { const { stdout } = await exec('git log -1 --format=%cI', { cwd }); return stdout.trim(); } catch { return ''; }
}

// 将常见的 git 远程地址转换为 https 基址，并移除 .git 后缀
function toHttpsRepoBase(remoteUrl: string): string {
    if (!remoteUrl) return '';
    let url = remoteUrl.trim();
    if (url.startsWith('git@')) {
        const match = /^git@([^:]+):(.+)$/.exec(url);
        if (match) {
            url = `https://${match[1]}/${match[2]}`;
        }
    }
    url = url.replace(/\.git$/, '');
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    return '';
}

// 构造仓库文件链接（兼容 GitHub/GitLab 的行锚点）
function buildRepoFileUrl(base: string, commitSha: string, repoRel: string, start: number, end: number): string {
    if (!base || !commitSha || !repoRel) return '';
    const anchor = start && end ? `#L${start}-L${end}` : '';
    const rel = repoRel.split(path.sep).join('/');
    return `${base}/blob/${commitSha}/${rel}${anchor}`;
}

// 聚合解析 Git 信息并生成 URL
async function resolveGitInfo(filePath: string, startLine: number, endLine: number): Promise<GitInfo> {
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
    return { gitRoot, branch, shortSha, commitTime, remote, httpsBase, repoRelPath, repoUrl };
}

// 根据 plainText 构造格式化函数
function makeFormatter(plainText: boolean) {
    return (label: string, value: string) => {
        const v = (value ?? '').toString();
        if (v.trim().length === 0) return '';
        if (plainText) return `${label}: ${v}`;
        const mdValue = (label === 'Source' || label === 'Path') ? `\`${v}\`` : v;
        return `**${label}:** ${mdValue}`;
    };
}

// 文件/路径相关 Header 提供者
function getFilePathHeaderProviders(ctx: EditorContext, git: GitInfo, fmt: (l: string, v: string) => string): HeaderOpt[] {
    const timestamp = new Date().toISOString();
    return [
        { id: 'source', render: () => fmt('Source', ctx.relativePath) },
        { id: 'lines', render: () => fmt('Lines', `${ctx.startLine}-${ctx.endLine}`) },
        { id: 'language', render: () => fmt('Language', ctx.lang) },
        { id: 'workspace', render: () => fmt('Workspace', ctx.workspaceName) },
        { id: 'file', render: () => fmt('File', ctx.fileName) },
        { id: 'path', render: () => fmt('Path', ctx.filePath) },
        { id: 'time', render: () => fmt('Time', timestamp) },
        { id: 'repoLink', render: () => fmt('Repo', git.repoUrl) },
        { id: 'gitBranch', render: () => fmt('Branch', git.branch) },
        { id: 'gitShortSha', render: () => fmt('SHA', git.shortSha) },
        { id: 'gitLastCommitTime', render: () => fmt('Last Commit', git.commitTime) },
    ];
}

// 代码结构相关 Header 提供者：基于语言适配器的 ContextInfo
function getCodeStructureHeaderProviders(codeCtx: ContextInfo, fmt: (l: string, v: string) => string): HeaderOpt[] {
    return [
        { id: 'function', render: () => codeCtx.functionName ? fmt('Function', codeCtx.functionName) : '' },
        { id: 'class', render: () => codeCtx.className ? fmt('Class', codeCtx.className) : '' },
        { id: 'module', render: () => codeCtx.moduleName ? fmt('Module', codeCtx.moduleName) : '' },
    ];
}

// 按配置 id 顺序渲染 Header 行
function renderSelected(ids: string[], providers: HeaderOpt[]): string[] {
    const index = new Map(providers.map(p => [p.id, p] as const));
    const lines: string[] = [];
    for (const id of ids) {
        const opt = index.get(id);
        if (!opt) continue;
        const line = opt.render();
        if (line) lines.push(line);
    }
    return lines;
}

// 组合最终输出文本
function buildOutput(headerLines: string[], plainText: boolean, lang: string, bodyText: string): string {
    const headerBlock = headerLines.length > 0 ? headerLines.join('\n\n') + '\n\n' : '';
    const body = plainText ? `${bodyText}` : `\`\`\`${lang}\n${bodyText}\n\`\`\`\n`;
    return headerBlock + body;
}
