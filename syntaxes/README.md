Place the compiled Tree-sitter Rust language file here as `tree-sitter-rust.wasm`.

Notes:
- You can build it from the `tree-sitter-rust` grammar or reuse a prebuilt wasm.
- The code resolves this path relative to the workspace: `syntaxes/tree-sitter-rust.wasm`.
- For production packaging, prefer resolving via `context.asAbsolutePath('syntaxes/tree-sitter-rust.wasm')`.

