# Pretty Code Copy

A lightweight VS Code extension to copy code “with context” in one keystroke.

When you copy from the editor using this extension, you can choose which header fields to include via a multi-select picker, then the selected header lines are added above the fenced code block.

Configurable header fields (setting: `PrettyCodeCopy.headers`):

 - source: file path relative to workspace
 - lines: selected (or whole-file) line range
 - language: language identifier used for the fence
 - workspace: current workspace name
 - file: file name only
 - path: absolute file path
 - time: ISO timestamp
 - repoLink: repository permalink to file at current commit (GitHub/GitLab style, with line anchors)
 - gitBranch: current branch name
 - gitShortSha: short commit SHA of HEAD
 - gitLastCommitTime: last commit time (ISO)

## Behavior

- With a selection: copies the selected code and annotates the selected line range.
- No selection: copies the entire file and annotates `1-<last line>`.
- Command: `Copy Code With File Path and Line Numbers` (ID: `PrettyCodeCopy.copy`).
- Default keybinding:
  - macOS: `Cmd+Alt+C`
  - Other platforms: not bound by default; bind `PrettyCodeCopy.copy` yourself in Keyboard Shortcuts.

## Usage

1. Open any code file and ensure the editor has focus (`editorTextFocus`).
2. Optional: select the code to copy; otherwise the whole file is used.
3. Configure once (optional): set `PrettyCodeCopy.headers` in Settings to choose which header fields are included (default: [source, lines]).
4. Trigger one of the following:
   - Press the keybinding (macOS: `Cmd+Alt+C`).
   - Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run `Copy Code With File Path and Line Numbers`.
5. You will see “Copied code with context!” and the content is in your clipboard.

### Settings examples

- UI: search for “Pretty Code Copy” → “Headers”.
- JSON:

```
"PrettyCodeCopy.headers": ["source", "lines", "language"]
```

### Plain text mode

- Setting: `PrettyCodeCopy.plainText` (boolean, default: false)
- When enabled, the extension outputs plain text without Markdown formatting:
  - Headers are rendered as `Key: Value` (no bold/backticks)
  - Code is appended as-is (no fenced code block)

## Package and Install

This project uses `vsce` to produce a `.vsix` package.

1) Install dependencies and build

```bash
npm install
npm run compile
```

2) Package to VSIX

Option A (recommended, no global install):

```bash
npx @vscode/vsce package
```

Option B (global install once):

```bash
npm i -g @vscode/vsce
vsce package
```

After success, you should see a file like `copy-code-with-context-0.0.1.vsix` at the project root.

3) Install the VSIX in VS Code

- Open VS Code → Extensions view.
- Click the “...” menu → `Install from VSIX...`.
- Select the generated `.vsix` to install.

## Develop and Debug

- Run extension host: press `F5` to launch an Extension Development Host.
- Build: `npm run compile` (or `npm run watch` for incremental builds).

## Notes

- The extension activates on first command execution (`activationEvents: onCommand`).
- If the keybinding conflicts with other extensions or the OS, rebind `PrettyCodeCopy.copy` in Keyboard Shortcuts.
