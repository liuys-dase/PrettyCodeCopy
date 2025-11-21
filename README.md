# Pretty Code Copy

A lightweight VS Code extension to copy code “with context” in one keystroke.

When you copy from the editor using this extension, it writes to the clipboard:

- The file path relative to your current workspace
- The line range (selection start–end; whole file when no selection)
- The actual code text

Copied result example:

```
source file: src/extension.ts
lines: 12-35
<copied code content>
```

## Behavior

- With a selection: copies the selected code and annotates the selected line range.
- No selection: copies the entire file and annotates `1-<last line>`.
- Command: `Copy Code With File Path and Line Numbers` (ID: `copyCodeWithContext.copy`).
- Default keybinding:
  - macOS: `Cmd+Alt+C`
  - Other platforms: not bound by default; bind `copyCodeWithContext.copy` yourself in Keyboard Shortcuts.

## Usage

1. Open any code file and ensure the editor has focus (`editorTextFocus`).
2. Optional: select the code to copy; otherwise the whole file is used.
3. Trigger one of the following:
   - Press the keybinding (macOS: `Cmd+Alt+C`).
   - Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run `Copy Code With File Path and Line Numbers`.
4. You will see “Copied code with context!” and the content is in your clipboard.

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
- If the keybinding conflicts with other extensions or the OS, rebind `copyCodeWithContext.copy` in Keyboard Shortcuts.
